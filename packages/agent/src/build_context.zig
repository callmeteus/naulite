const std = @import("std");

const process_cmd = @import("process_cmd.zig");
const blocking_io = @import("blocking_io.zig");

const default_build_root = "/var/lib/naulite/builds";

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
    const io = blocking_io.io();

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

    std.Io.Dir.cwd().createDirPath(io, default_build_root) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    std.Io.Dir.cwd().createDirPath(io, context_path) catch |err| switch (err) {
        error.PathAlreadyExists => {},
        else => return err,
    };

    const temp_archive_path = try std.fmt.allocPrint(allocator, "{s}/.receive-{d}.tar.gz", .{ context_path, archive_bytes.bytes.len });
    defer allocator.free(temp_archive_path);

    {
        var file = try std.Io.Dir.cwd().createFile(io, temp_archive_path, .{});
        defer file.close(io);
        var write_buffer: [65536]u8 = undefined;
        var file_writer = file.writer(io, &write_buffer);
        try file_writer.interface.writeAll(archive_bytes.bytes);
        try file_writer.interface.flush();
    }

    runTarExtract(allocator, temp_archive_path, context_path) catch |err| {
        std.Io.Dir.cwd().deleteFile(io, temp_archive_path) catch {};
        return err;
    };

    std.Io.Dir.cwd().deleteFile(io, temp_archive_path) catch {};

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

/// Resolves a service name from a build context request.
fn resolveServiceName(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The body of the build context request.
    body: []const u8,
    // The service name hint.
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

/// Resolves the archive bytes from a build context request.
fn resolveArchiveBytes(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The body of the build context request.
    body: []const u8,
    // Whether the body is a raw archive.
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

/// Parses a service name from a JSON build context request.
fn parseJsonServiceName(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The body of the build context request.
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

/// Gets a string value from a JSON object.
fn objectGetString(
    // The object to get the value from.
    object: std.json.ObjectMap,
    // The field name to get the value from.
    field_name: []const u8,
) ?[]const u8 {
    const value = object.get(field_name) orelse return null;
    return switch (value) {
        .string => |text| text,
        else => null,
    };
}

/// Decodes a base64-encoded string.
fn decodeBase64(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The base64-encoded string to decode.
    encoded: []const u8,
) ![]u8 {
    const decoder = std.base64.standard.Decoder;
    const decoded_size = try decoder.calcSizeForSlice(encoded);
    const buffer = try allocator.alloc(u8, decoded_size);
    errdefer allocator.free(buffer);

    try decoder.decode(buffer, encoded);
    return buffer;
}

/// Runs a tar extraction command.
fn runTarExtract(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The path to the archive to extract.
    archive_path: []const u8,
    // The path to the destination directory.
    destination_path: []const u8,
) !void {
    const args = [_][]const u8{ "tar", "-xzf", archive_path, "-C", destination_path };

    try runCommand(allocator, &args);
}

/// Runs a command and returns the output.
fn runCommand(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The command to run.
    args: []const []const u8,
) !void {
    return process_cmd.runCommandVoid(allocator, args) catch |err| switch (err) {
        error.CommandFailed => error.CommandFailed,
        else => |other| other,
    };
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

    try std.testing.expectError(error.MissingServiceName, resolveServiceName(allocator, &[_]u8{0x1f}, ""));
}
