const logger = @import("logger");

const log_host_update = logger.Logger.create("host-update");

const std = @import("std");

const host_package_manager = @import("host_package_manager.zig");

/// Result of a host update task executed on the agent.
pub const HostUpdateTaskResult = struct {
    status: []const u8,
    body: []const u8,
    error_message: ?[]const u8,
};

/// Executes a package update task JSON payload from the control plane.
pub fn executePackageUpdateTask(
    allocator: std.mem.Allocator,
    body: []const u8,
) !HostUpdateTaskResult {
    const packages = try readPackages(allocator, body);
    defer freePackages(allocator, packages);

    log_host_update.debug("package update requested count={d}", .{packages.len});

    const result = host_package_manager.updatePackages(allocator, packages) catch |err| switch (err) {
        error.UnsupportedOs => {
            return .{
                .status = try allocator.dupe(u8, "failed"),
                .body = try allocator.dupe(u8, "{\"error\":\"unsupported_os\"}"),
                .error_message = try allocator.dupe(u8, "Host package updates are only supported on Linux."),
            };
        },
        else => return err,
    };
    defer freeUpdateResult(allocator, result);

    const response_body = try host_package_manager.updateResultToJson(allocator, result);

    return .{
        .status = try allocator.dupe(u8, result.status),
        .body = response_body,
        .error_message = if (result.error_message) |message| try allocator.dupe(u8, message) else null,
    };
}

/// Executes a system update task from the control plane.
pub fn executeSystemUpdateTask(allocator: std.mem.Allocator) !HostUpdateTaskResult {
    log_host_update.debug("system update requested", .{});

    const result = host_package_manager.updateSystem(allocator) catch |err| switch (err) {
        error.UnsupportedOs => {
            return .{
                .status = try allocator.dupe(u8, "failed"),
                .body = try allocator.dupe(u8, "{\"error\":\"unsupported_os\"}"),
                .error_message = try allocator.dupe(u8, "Host system updates are only supported on Linux."),
            };
        },
        else => return err,
    };
    defer freeUpdateResult(allocator, result);

    const response_body = try host_package_manager.updateResultToJson(allocator, result);

    return .{
        .status = try allocator.dupe(u8, result.status),
        .body = response_body,
        .error_message = if (result.error_message) |message| try allocator.dupe(u8, message) else null,
    };
}

fn readPackages(allocator: std.mem.Allocator, body: []const u8) ![]const []const u8 {
    if (body.len == 0) {
        return try allocator.alloc([]const u8, 0);
    }

    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return try allocator.alloc([]const u8, 0);
    }

    const packages_value = root.object.get("packages") orelse {
        return try allocator.alloc([]const u8, 0);
    };

    if (packages_value != .array) {
        return error.InvalidHostUpdateTask;
    }

    var packages = try allocator.alloc([]const u8, packages_value.array.items.len);
    errdefer allocator.free(packages);

    for (packages_value.array.items, 0..) |item, index| {
        if (item != .string) {
            return error.InvalidHostUpdateTask;
        }
        packages[index] = try allocator.dupe(u8, item.string);
    }

    return packages;
}

fn freePackages(allocator: std.mem.Allocator, packages: []const []const u8) void {
    for (packages) |pkg| {
        allocator.free(pkg);
    }
    allocator.free(packages);
}

fn freeUpdateResult(allocator: std.mem.Allocator, result: host_package_manager.UpdateResult) void {
    allocator.free(result.status);
    for (result.packages) |pkg| {
        allocator.free(pkg);
    }
    allocator.free(result.packages);
    if (result.stdout) |stdout| {
        allocator.free(stdout);
    }
    if (result.stderr) |stderr| {
        allocator.free(stderr);
    }
    if (result.error_message) |error_message| {
        allocator.free(error_message);
    }
}

test "executePackageUpdateTask accepts empty body" {
    const allocator = std.testing.allocator;
    const result = try executePackageUpdateTask(allocator, "{}");
    defer allocator.free(result.status);
    defer allocator.free(result.body);
    if (result.error_message) |message| {
        allocator.free(message);
    }
    try std.testing.expect(std.mem.eql(u8, result.status, "succeeded") or std.mem.eql(u8, result.status, "failed"));
}
