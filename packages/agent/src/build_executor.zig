const std = @import("std");

/// Result of a build task executed on the agent.
pub const BuildTaskResult = struct {
    // Control plane task identifier.
    task_id: []const u8,

    // Final task status string.
    status: []const u8,

    // Built image reference when the task succeeded.
    image_ref: ?[]const u8,

    // Build log lines joined for the response payload.
    logs: ?[]const u8,

    // Error message when the task failed.
    error_message: ?[]const u8,
};

/// Executes a build task JSON payload from the control plane.
pub fn executeBuildTask(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Path to the Docker Unix socket or named pipe.
    docker_socket: []const u8,
    // The build task JSON payload.
    body: []const u8,
) !BuildTaskResult {
    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidBuildTask;
    }

    const task_id = try readStringField(allocator, root.object, "taskId", "build");
    errdefer allocator.free(task_id);

    const service_name = try readStringField(allocator, root.object, "serviceName", "service");
    errdefer allocator.free(service_name);

    const context_path = try resolveContextPath(allocator, root.object, service_name);
    errdefer allocator.free(context_path);

    const dockerfile = try readOptionalStringField(allocator, root.object, "dockerfile");
    errdefer if (dockerfile) |value| allocator.free(value);

    const image_ref = try resolveImageRef(allocator, root.object, service_name);
    errdefer allocator.free(image_ref);

    std.log.debug(
        "[build] execute taskId={s} service={s} context={s} image={s}",
        .{ task_id, service_name, context_path, image_ref },
    );

    const build_logs = runDockerBuild(
        allocator,
        docker_socket,
        context_path,
        dockerfile,
        image_ref,
    ) catch |err| {
        const message = try std.fmt.allocPrint(allocator, "docker build failed: {}", .{err});
        return .{
            .task_id = task_id,
            .status = try allocator.dupe(u8, "failed"),
            .image_ref = null,
            .logs = build_logs catch null,
            .error_message = message,
        };
    };
    defer allocator.free(build_logs);

    return .{
        .task_id = task_id,
        .status = try allocator.dupe(u8, "completed"),
        .image_ref = image_ref,
        .logs = build_logs,
        .error_message = null,
    };
}

fn runDockerBuild(
    allocator: std.mem.Allocator,
    docker_socket: []const u8,
    context_path: []const u8,
    dockerfile: ?[]const u8,
    image_ref: []const u8,
) ![]u8 {
    const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
    defer allocator.free(docker_host);

    var args = std.ArrayList([]const u8).empty;
    defer args.deinit(allocator);

    try args.appendSlice(allocator, &[_][]const u8{ "docker", "-H", docker_host, "build", "-t", image_ref });

    if (dockerfile) |file_name| {
        const dockerfile_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ context_path, file_name });
        defer allocator.free(dockerfile_path);
        try args.append(allocator, "-f");
        try args.append(allocator, dockerfile_path);
    }

    try args.append(allocator, context_path);

    var child = std.process.Child.init(args.items, allocator);
    child.stdout_behavior = .Pipe;
    child.stderr_behavior = .Pipe;

    try child.spawn();

    const stdout = try child.stdout.?.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(stdout);

    const stderr = try child.stderr.?.readToEndAlloc(allocator, 1024 * 1024);
    defer allocator.free(stderr);

    const term = try child.wait();

    const combined = try std.fmt.allocPrint(
        allocator,
        "{s}{s}",
        .{ stdout, stderr },
    );

    switch (term) {
        .Exited => |code| {
            if (code != 0) {
                std.log.err("[build] docker build exit={d} image={s}", .{ code, image_ref });
                return error.DockerBuildFailed;
            }
        },
        else => return error.DockerBuildFailed,
    }

    return combined;
}

fn resolveContextPath(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    service_name: []const u8,
) ![]u8 {
    const synced_path = try std.fmt.allocPrint(allocator, "/var/lib/platform/builds/{s}", .{service_name});
    errdefer allocator.free(synced_path);

    // Prefer synced build context when the control plane already pushed an archive.
    if (directoryExists(synced_path)) {
        return synced_path;
    }

    if (object.get("contextPath")) |value| {
        return switch (value) {
            .string => |path| {
                allocator.free(synced_path);
                return try allocator.dupe(u8, path);
            },
            else => error.InvalidBuildTask,
        };
    }

    return synced_path;
}

fn directoryExists(path: []const u8) bool {
    var dir = std.fs.cwd().openDir(path, .{}) catch return false;
    dir.close();
    return true;
}

fn resolveImageRef(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    service_name: []const u8,
) ![]u8 {
    if (object.get("tags")) |value| {
        if (value == .array and value.array.items.len > 0) {
            const first = value.array.items[0];
            if (first == .string) {
                return try allocator.dupe(u8, first.string);
            }
        }
    }

    if (object.get("imageRef")) |value| {
        return switch (value) {
            .string => |image| try allocator.dupe(u8, image),
            else => error.InvalidBuildTask,
        };
    }

    return try std.fmt.allocPrint(allocator, "platform/{s}:latest", .{service_name});
}

fn readStringField(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    field_name: []const u8,
    fallback: []const u8,
) ![]u8 {
    if (object.get(field_name)) |value| {
        return switch (value) {
            .string => |text| try allocator.dupe(u8, text),
            else => error.InvalidBuildTask,
        };
    }

    return try allocator.dupe(u8, fallback);
}

fn readOptionalStringField(
    allocator: std.mem.Allocator,
    object: std.json.ObjectMap,
    field_name: []const u8,
) !?[]u8 {
    if (object.get(field_name)) |value| {
        return switch (value) {
            .string => |text| try allocator.dupe(u8, text),
            else => error.InvalidBuildTask,
        };
    }

    return null;
}

test "resolveImageRef defaults to platform tag" {
    const allocator = std.testing.allocator;
    var object = std.json.ObjectMap.init(allocator);
    defer object.deinit();

    const image_ref = try resolveImageRef(allocator, object, "api");
    defer allocator.free(image_ref);

    try std.testing.expectEqualStrings("platform/api:latest", image_ref);
}

test "resolveContextPath defaults to service build directory" {
    const allocator = std.testing.allocator;
    var object = std.json.ObjectMap.init(allocator);
    defer object.deinit();

    const context_path = try resolveContextPath(allocator, object, "api");
    defer allocator.free(context_path);

    try std.testing.expectEqualStrings("/var/lib/platform/builds/api", context_path);
}
