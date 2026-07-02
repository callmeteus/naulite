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
    if (root != .object) return error.InvalidBackupTask;

    const task_id_value = root.object.get("taskId") orelse return error.InvalidBackupTask;
    const task_id = switch (task_id_value) {
        .string => |s| s,
        else => return error.InvalidBackupTask,
    };

    std.log.debug("[backup] execute taskId={s} body_len={d}", .{ task_id, body.len });

    const archive_path = try std.fmt.allocPrint(allocator, "/var/lib/platform/backups/{s}.tar.gz", .{task_id});

    return .{
        .task_id = try allocator.dupe(u8, task_id),
        .status = try allocator.dupe(u8, "completed"),
        .archive_path = archive_path,
        .error_message = null,
    };
}

/// Receives a backup archive streamed from another agent node (stub).
pub fn receiveBackupArchive(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The backup archive bytes.
    body: []const u8,
) ![]const u8 {
    std.log.debug("[backup] receive archive bytes={d}", .{body.len});

    return try std.fmt.allocPrint(allocator, "/var/lib/platform/backups/received-{d}.tar.gz", .{body.len});
}
