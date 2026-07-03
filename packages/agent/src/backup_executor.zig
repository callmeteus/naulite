const std = @import("std");

/// Result of a backup task executed on the agent.
pub const BackupTaskResult = struct {
    // Control plane task identifier.
    task_id: []const u8,

    // Final task status string.
    status: []const u8,

    // Path to the created archive, if any.
    archive_path: ?[]const u8,

    // Error message when the task failed.
    error_message: ?[]const u8,
};

/// Result of a backup restore task executed on the agent.
pub const BackupRestoreResult = struct {
    // Backup run identifier.
    backup_id: []const u8,

    // Final task status string.
    status: []const u8,

    // Restored volume name.
    volume_name: []const u8,

    // Error message when the task failed.
    error_message: ?[]const u8,
};

const default_backup_root = "/var/lib/platform/backups";

/// Executes a backup task JSON payload from the control plane.
pub fn executeBackupTask(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The backup task JSON payload.
    body: []const u8,
) !BackupTaskResult {
    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidBackupTask;
    }

    const task_id = try readStringField(allocator, root.object, "taskId", null);
    errdefer allocator.free(task_id);

    const volume_name = try readStringField(allocator, root.object, "volumeName", null);
    errdefer allocator.free(volume_name);

    const mount_path = try resolveMountPath(allocator, root.object, volume_name);
    errdefer allocator.free(mount_path);

    const excludes = try readStringArray(allocator, root.object, "excludes");
    defer freeStringArray(allocator, excludes);

    std.log.debug(
        "[backup] execute taskId={s} volume={s} mountPath={s} excludes={d}",
        .{ task_id, volume_name, mount_path, excludes.len },
    );

    try std.fs.cwd().makePath(default_backup_root) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    const archive_path = try std.fmt.allocPrint(allocator, "{s}/{s}.tar.gz", .{ default_backup_root, task_id });
    errdefer allocator.free(archive_path);

    runTarCreate(allocator, archive_path, mount_path, excludes) catch |err| {
        const message = try std.fmt.allocPrint(allocator, "tar create failed: {}", .{err});
        return .{
            .task_id = task_id,
            .status = try allocator.dupe(u8, "failed"),
            .archive_path = null,
            .error_message = message,
        };
    };

    return .{
        .task_id = task_id,
        .status = try allocator.dupe(u8, "completed"),
        .archive_path = archive_path,
        .error_message = null,
    };
}

/// Restores a backup archive into a volume mount path.
pub fn restoreBackupArchive(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The restore task JSON payload.
    body: []const u8,
) !BackupRestoreResult {
    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidBackupRestoreTask;
    }

    const backup_id = try readStringField(allocator, root.object, "backupId", null);
    errdefer allocator.free(backup_id);

    const volume_name = try readStringField(allocator, root.object, "volumeName", null);
    errdefer allocator.free(volume_name);

    const archive_path = try resolveArchivePath(allocator, root.object, backup_id);
    errdefer allocator.free(archive_path);

    const mount_path = try resolveMountPath(allocator, root.object, volume_name);
    errdefer allocator.free(mount_path);

    std.log.debug(
        "[backup] restore backupId={s} volume={s} archive={s} mountPath={s}",
        .{ backup_id, volume_name, archive_path, mount_path },
    );

    try std.fs.cwd().makePath(mount_path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    runTarExtract(allocator, archive_path, mount_path) catch |err| {
        const message = try std.fmt.allocPrint(allocator, "tar extract failed: {}", .{err});
        return .{
            .backup_id = backup_id,
            .status = try allocator.dupe(u8, "failed"),
            .volume_name = volume_name,
            .error_message = message,
        };
    };

    return .{
        .backup_id = backup_id,
        .status = try allocator.dupe(u8, "completed"),
        .volume_name = volume_name,
        .error_message = null,
    };
}

/// Receives a backup archive streamed from another agent node.
pub fn receiveBackupArchive(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Optional backup identifier from the query string or headers.
    backup_id: ?[]const u8,
    // The backup archive bytes.
    body: []const u8,
) ![]const u8 {
    std.log.debug("[backup] receive archive bytes={d} backupId={s}", .{
        body.len,
        backup_id orelse "-",
    });

    try std.fs.cwd().makePath(default_backup_root) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    const file_name = if (backup_id) |id|
        try std.fmt.allocPrint(allocator, "{s}/{s}.tar.gz", .{ default_backup_root, id })
    else
        try std.fmt.allocPrint(allocator, "{s}/received-{d}.tar.gz", .{ default_backup_root, body.len });

    const file = try std.fs.cwd().createFile(file_name, .{});
    defer file.close();

    try file.writeAll(body);

    return file_name;
}

fn runTarCreate(
    allocator: std.mem.Allocator,
    archive_path: []const u8,
    source_path: []const u8,
    excludes: []const []const u8,
) !void {
    var args = std.ArrayList([]const u8).empty;
    defer {
        for (args.items[5..]) |arg| {
            allocator.free(arg);
        }
        args.deinit(allocator);
    }

    try args.appendSlice(allocator, &[_][]const u8{ "tar", "-czf", archive_path, "-C", source_path, "." });

    for (excludes) |pattern| {
        const exclude_flag = try std.fmt.allocPrint(allocator, "--exclude={s}", .{pattern});
        try args.append(allocator, exclude_flag);
    }

    try runCommand(allocator, args.items);
}

fn runTarExtract(
    allocator: std.mem.Allocator,
    archive_path: []const u8,
    destination_path: []const u8,
) !void {
    const args = [_][]const u8{ "tar", "-xzf", archive_path, "-C", destination_path };
    try runCommand(allocator, &args);
}

fn runCommand(allocator: std.mem.Allocator, args: []const []const u8) !void {
    var child = std.process.Child.init(args, allocator);
    child.stdout_behavior = .Ignore;
    child.stderr_behavior = .Pipe;

    try child.spawn();

    const stderr = try child.stderr.?.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(stderr);

    const term = try child.wait();

    switch (term) {
        .Exited => |code| {
            if (code != 0) {
                std.log.err("[backup] command failed exit={d} stderr={s}", .{ code, stderr });
                return error.CommandFailed;
            }
        },
        else => return error.CommandFailed,
    }
}

fn resolveMountPath(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    volume_name: []const u8,
) ![]u8 {
    if (object.get("mountPath")) |value| {
        return switch (value) {
            .string => |path| try allocator.dupe(u8, path),
            else => error.InvalidBackupTask,
        };
    }

    return try std.fmt.allocPrint(allocator, "/var/lib/platform/volumes/{s}", .{volume_name});
}

fn resolveArchivePath(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    backup_id: []const u8,
) ![]u8 {
    if (object.get("archivePath")) |value| {
        return switch (value) {
            .string => |path| try allocator.dupe(u8, path),
            else => error.InvalidBackupRestoreTask,
        };
    }

    return try std.fmt.allocPrint(allocator, "{s}/{s}.tar.gz", .{ default_backup_root, backup_id });
}

fn readStringField(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    field_name: []const u8,
    fallback: ?[]const u8,
) ![]u8 {
    if (object.get(field_name)) |value| {
        return switch (value) {
            .string => |text| try allocator.dupe(u8, text),
            else => error.InvalidBackupTask,
        };
    }

    if (fallback) |text| {
        return try allocator.dupe(u8, text);
    }

    return error.InvalidBackupTask;
}

fn readStringArray(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    field_name: []const u8,
) ![]const []const u8 {
    if (object.get(field_name)) |value| {
        if (value != .array) {
            return error.InvalidBackupTask;
        }

        const items = try allocator.alloc([]const u8, value.array.items.len);

        for (value.array.items, 0..) |item, index| {
            items[index] = switch (item) {
                .string => |text| try allocator.dupe(u8, text),
                else => return error.InvalidBackupTask,
            };
        }

        return items;
    }

    return &[_][]const u8{};
}

fn freeStringArray(allocator: std.mem.Allocator, values: []const []const u8) void {
    for (values) |value| {
        allocator.free(value);
    }
    allocator.free(values);
}

test "resolveMountPath defaults to volume directory" {
    const allocator = std.testing.allocator;
    var object = std.json.ObjectMap.init(allocator);
    defer object.deinit();

    const mount_path = try resolveMountPath(allocator, object, "postgres-data");
    defer allocator.free(mount_path);

    try std.testing.expectEqualStrings("/var/lib/platform/volumes/postgres-data", mount_path);
}

test "resolveArchivePath defaults to backup root" {
    const allocator = std.testing.allocator;
    var object = std.json.ObjectMap.init(allocator);
    defer object.deinit();

    const archive_path = try resolveArchivePath(allocator, object, "run-123");
    defer allocator.free(archive_path);

    try std.testing.expectEqualStrings("/var/lib/platform/backups/run-123.tar.gz", archive_path);
}
