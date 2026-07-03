const std = @import("std");

const default_build_root = "/var/lib/platform/builds";

/// Result of a build context sync received from the control plane.
pub const BuildContextResult = struct {
    // Manifest service name for the synced context.
    service_name: []const u8,

    // Directory where the build context was extracted.
    context_path: []const u8,

    // Sync status reported to the caller.
    status: []const u8,
};

/// Receives a build context archive and extracts it for later docker builds.
pub fn receiveBuildContext(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Request body bytes, either JSON metadata or a raw gzip tarball.
    body: []const u8,
    // Optional service name from a query parameter or request header.
    service_name_hint: ?[]const u8,
) !BuildContextResult {
    const service_name_owned = try resolveServiceName(allocator, body, service_name_hint);
    errdefer allocator.free(service_name_owned);

    const archive_bytes = try resolveArchiveBytes(allocator, body, service_name_hint != null);
    defer if (archive_bytes.source == .owned) allocator.free(archive_bytes.bytes);

    const context_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ default_build_root, service_name_owned });
    errdefer allocator.free(context_path);

    std.log.debug(
        "[build-context] receive service={s} bytes={d} contextPath={s}",
        .{ service_name_owned, archive_bytes.bytes.len, context_path },
    );

    try std.fs.cwd().makePath(default_build_root) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    try std.fs.cwd().makePath(context_path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    const temp_archive_path = try std.fmt.allocPrint(allocator, "{s}/.receive-{d}.tar.gz", .{ context_path, archive_bytes.bytes.len });
    defer allocator.free(temp_archive_path);

    {
        const file = try std.fs.cwd().createFile(temp_archive_path, .{});
        defer file.close();
        try file.writeAll(archive_bytes.bytes);
    }

    runTarExtract(allocator, temp_archive_path, context_path) catch |err| {
        std.fs.cwd().deleteFile(temp_archive_path) catch {};
        return err;
    };

    std.fs.cwd().deleteFile(temp_archive_path) catch {};

    return .{
        .service_name = service_name_owned,
        .context_path = context_path,
        .status = try allocator.dupe(u8, "ready"),
    };
}

const ArchiveBytes = struct {
    bytes: []const u8,
    source: enum { borrowed, owned },
};

fn resolveServiceName(
    allocator: std.mem.Allocator,
    body: []const u8,
    service_name_hint: ?[]const u8,
) ![]u8 {
    if (try parseJsonServiceName(allocator, body)) |service_name| {
        return service_name;
    }

    if (service_name_hint) |service_name| {
        if (service_name.len == 0) {
            return error.MissingServiceName;
        }
        return try allocator.dupe(u8, service_name);
    }

    return error.MissingServiceName;
}

fn resolveArchiveBytes(
    allocator: std.mem.Allocator,
    body: []const u8,
    raw_body_mode: bool,
) !ArchiveBytes {
    if (raw_body_mode) {
        if (body.len == 0) {
            return error.MissingArchive;
        }
        return .{
            .bytes = body,
            .source = .borrowed,
        };
    }

    const parsed = std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    ) catch return error.InvalidBuildContextRequest;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidBuildContextRequest;
    }

    const archive_base64 = objectGetString(root.object, "archiveBase64") orelse return error.MissingArchive;
    const decoded = try decodeBase64(allocator, archive_base64);

    return .{
        .bytes = decoded,
        .source = .owned,
    };
}

fn parseJsonServiceName(
    allocator: std.mem.Allocator,
    body: []const u8,
) !?[]u8 {
    const parsed = std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    ) catch return null;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return null;
    }

    const service_name = objectGetString(root.object, "serviceName") orelse return null;
    if (service_name.len == 0) {
        return error.MissingServiceName;
    }

    return try allocator.dupe(u8, service_name);
}

fn objectGetString(object: std.json.ObjectMap, field_name: []const u8) ?[]const u8 {
    const value = object.get(field_name) orelse return null;
    return switch (value) {
        .string => |text| text,
        else => null,
    };
}

fn decodeBase64(allocator: std.mem.Allocator, encoded: []const u8) ![]u8 {
    const decoder = std.base64.standard.Decoder;
    const decoded_size = try decoder.calcSizeForSlice(encoded);
    const buffer = try allocator.alloc(u8, decoded_size);
    errdefer allocator.free(buffer);

    try decoder.decode(buffer, encoded);
    return buffer;
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
                std.log.err("[build-context] command failed exit={d} stderr={s}", .{ code, stderr });
                return error.CommandFailed;
            }
        },
        else => return error.CommandFailed,
    }
}

test "resolveServiceName prefers JSON serviceName" {
    const allocator = std.testing.allocator;

    const service_name = try resolveServiceName(
        allocator,
        "{\"serviceName\":\"web\",\"archiveBase64\":\"Zg==\"}",
        "header-service",
    );
    defer allocator.free(service_name);

    try std.testing.expectEqualStrings("web", service_name);
}

test "resolveServiceName uses hint for raw archive body" {
    const allocator = std.testing.allocator;

    const service_name = try resolveServiceName(allocator, &[_]u8{ 0x1f, 0x8b }, "api");
    defer allocator.free(service_name);

    try std.testing.expectEqualStrings("api", service_name);
}

test "resolveServiceName rejects empty hint" {
    const allocator = std.testing.allocator;

    try std.testing.expectError(error.MissingServiceName, resolveServiceName(allocator, &[_]u8{ 0x1f }, ""));
}
