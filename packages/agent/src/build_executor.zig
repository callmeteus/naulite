const std = @import("std");

const cp_client = @import("cp_client.zig");
const dockerfile_parser = @import("dockerfile_parser.zig");
const process_cmd = @import("process_cmd.zig");
const blocking_io = @import("blocking_io.zig");

/// Result of a build task executed on the agent.
pub const BuildTaskResult = struct {
    // Control plane task identifier.
    task_id: []const u8,

    // Final task status string.
    status: []const u8,

    // Built image reference when the task succeeded.
    image_ref: ?[]const u8,

    // Whether the image tarball was pushed to the control plane registry.
    pushed: bool,

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

    const run_id = try readOptionalStringField(allocator, root.object, "runId");
    defer if (run_id) |value| allocator.free(value);

    const cp_url = try readOptionalStringField(allocator, root.object, "cpUrl");
    defer if (cp_url) |value| allocator.free(value);

    const cr_name = try readOptionalStringField(allocator, root.object, "crName");
    defer if (cr_name) |value| allocator.free(value);

    const cr_tag = try readOptionalStringField(allocator, root.object, "crTag");
    defer if (cr_tag) |value| allocator.free(value);

    const api_key = try readOptionalStringField(allocator, root.object, "apiKey");
    defer if (api_key) |value| allocator.free(value);

    std.log.debug(
        "[build] execute taskId={s} service={s} context={s} image={s} runId={?s} cr={?s}:{?s}",
        .{ task_id, service_name, context_path, image_ref, run_id, cr_name, cr_tag },
    );

    const steps = try loadDockerfileSteps(
        allocator,
        context_path,
        dockerfile,
    );
    defer freeSteps(allocator, steps);

    if (run_id) |pipeline_run_id| {
        if (cp_url) |url| {
            for (steps) |step| {
                cp_client.reportRunEventUrl(
                    allocator,
                    url,
                    pipeline_run_id,
                    "build.step.started",
                    step.name,
                    null,
                    null,
                    api_key,
                );
            }
        }
    }

    const build_logs = runDockerBuild(
        allocator,
        docker_socket,
        context_path,
        dockerfile,
        image_ref,
    ) catch |err| {
        const message = try std.fmt.allocPrint(allocator, "docker build failed: {}", .{err});
        if (run_id) |pipeline_run_id| {
            if (cp_url) |url| {
                const failed_step = if (steps.len > 0) steps[steps.len - 1].name else "docker-build";
                cp_client.reportRunEventUrl(
                    allocator,
                    url,
                    pipeline_run_id,
                    "build.step.failed",
                    failed_step,
                    message,
                    null,
                    api_key,
                );
            }
        }
        return .{
            .task_id = task_id,
            .status = try allocator.dupe(u8, "failed"),
            .image_ref = null,
            .pushed = false,
            .logs = null,
            .error_message = message,
        };
    };
    defer allocator.free(build_logs);

    if (run_id) |pipeline_run_id| {
        if (cp_url) |url| {
            for (steps) |step| {
                cp_client.reportRunEventUrl(
                    allocator,
                    url,
                    pipeline_run_id,
                    "build.step.finished",
                    step.name,
                    null,
                    build_logs,
                    api_key,
                );
            }
        }
    }

    const cr_image_ref = if (cr_name) |name| blk: {
        if (cr_tag) |tag| {
            break :blk try std.fmt.allocPrint(allocator, "container-registry://{s}:{s}", .{ name, tag });
        }
        break :blk null;
    } else null;
    defer if (cr_image_ref) |value| {
        allocator.free(value);
    };

    if (cp_url) |url| {
        if (cr_name) |name| {
            if (cr_tag) |tag| {
                pushImageToRegistry(
                    allocator,
                    docker_socket,
                    image_ref,
                    url,
                    name,
                    tag,
                    api_key,
                ) catch |err| {
                    const message = try std.fmt.allocPrint(allocator, "container registry push failed: {}", .{err});
                    return .{
                        .task_id = task_id,
                        .status = try allocator.dupe(u8, "failed"),
                        .image_ref = null,
                        .pushed = false,
                        .logs = build_logs,
                        .error_message = message,
                    };
                };
            }
        }
    }

    const final_image_ref = cr_image_ref orelse try allocator.dupe(u8, image_ref);

    return .{
        .task_id = task_id,
        .status = try allocator.dupe(u8, "completed"),
        .image_ref = final_image_ref,
        .pushed = cr_image_ref != null,
        .logs = build_logs,
        .error_message = null,
    };
}

/// Runs a Docker build and returns the logs.
fn runDockerBuild(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Path to the Docker Unix socket or named pipe.
    docker_socket: []const u8,
    // Path to the build context.
    context_path: []const u8,
    // Name of the Dockerfile to use.
    dockerfile: ?[]const u8,
    // The image reference to use.
    image_ref: []const u8,
) ![]u8 {
    const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
    defer allocator.free(docker_host);

    var args = std.ArrayList([]const u8).empty;
    defer args.deinit(allocator);

    try args.appendSlice(allocator, &[_][]const u8{ "docker", "-H", docker_host, "build", "--progress=plain", "-t", image_ref });

    if (dockerfile) |file_name| {
        const dockerfile_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ context_path, file_name });
        defer allocator.free(dockerfile_path);
        try args.append(allocator, "-f");
        try args.append(allocator, dockerfile_path);
    }

    try args.append(allocator, context_path);

    const captured = try process_cmd.runCapture(allocator, args.items);
    defer allocator.free(captured.stderr);

    const combined = try std.fmt.allocPrint(
        allocator,
        "{s}{s}",
        .{ captured.stdout, captured.stderr },
    );
    errdefer allocator.free(combined);
    allocator.free(captured.stdout);

    switch (captured.exited_normally and captured.exit_code == 0) {
        false => {
            std.log.err("[build] docker build exit={d} image={s}", .{ captured.exit_code, image_ref });
            return error.DockerBuildFailed;
        },
        true => {},
    }

    return combined;
}

/// Pushes an image to a container registry.
fn pushImageToRegistry(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Path to the Docker Unix socket or named pipe.
    docker_socket: []const u8,
    image_ref: []const u8,
    // The URL of the control plane.
    cp_url: []const u8,
    // The name of the container registry.
    cr_name: []const u8,
    // The tag of the container registry.
    cr_tag: []const u8,
    // The API key to use.
    api_key: ?[]const u8,
) !void {
    const io = blocking_io.io();
    const archive_path = try std.fmt.allocPrint(allocator, "/tmp/naulite-build-{s}-{s}.tar", .{ cr_name, cr_tag });
    defer allocator.free(archive_path);

    if (std.Io.Dir.cwd().access(io, archive_path, .{})) |_| {
        std.Io.Dir.cwd().deleteFile(io, archive_path) catch {};
    } else |_| {}

    const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
    defer allocator.free(docker_host);

    const save_args = [_][]const u8{ "docker", "-H", docker_host, "save", "-o", archive_path, image_ref };
    try process_cmd.runCommandVoid(allocator, &save_args);

    const archive_bytes = try std.Io.Dir.cwd().readFileAlloc(io, archive_path, allocator, .limited(512 * 1024 * 1024));
    defer allocator.free(archive_bytes);
    defer std.Io.Dir.cwd().deleteFile(io, archive_path) catch {};

    try cp_client.putRegistryImage(allocator, cp_url, cr_name, cr_tag, archive_bytes, api_key);
    std.log.debug("[build] pushed image name={s} tag={s} bytes={d}", .{ cr_name, cr_tag, archive_bytes.len });
}

/// Resolves the context path for a build.
fn resolveContextPath(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The JSON object to use.
    object: std.json.ObjectMap,
    // The name of the service.
    service_name: []const u8,
) ![]u8 {
    const synced_path = try std.fmt.allocPrint(allocator, "/var/lib/naulite/builds/{s}", .{service_name});
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

/// Checks if a directory exists.
fn directoryExists(
    // The path to check.
    path: []const u8,
) bool {
    const io = blocking_io.io();
    var dir = std.Io.Dir.cwd().openDir(io, path, .{}) catch return false;
    dir.close(io);
    return true;
}

/// Resolves the image reference for a build.
fn resolveImageRef(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The JSON object to use.
    object: std.json.ObjectMap,
    // The name of the service.
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

    return try std.fmt.allocPrint(allocator, "naulite/{s}:latest", .{service_name});
}

/// Reads a string field from a JSON object.
fn readStringField(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The JSON object to use.
    object: std.json.ObjectMap,
    // The name of the field to read.
    field_name: []const u8,
    // The fallback value to use if the field is not present.
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

/// Reads an optional string field from a JSON object.
fn readOptionalStringField(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The JSON object to use.
    object: std.json.ObjectMap,
    // The name of the field to read.
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

/// Loads the steps from a Dockerfile.
fn loadDockerfileSteps(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The path to the build context.
    context_path: []const u8,
    // The name of the Dockerfile to use.
    dockerfile: ?[]const u8,
) ![]dockerfile_parser.StepMarker {
    const io = blocking_io.io();
    const file_name = dockerfile orelse "Dockerfile";
    const dockerfile_path = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ context_path, file_name });
    defer allocator.free(dockerfile_path);

    const content = std.Io.Dir.cwd().readFileAlloc(io, dockerfile_path, allocator, .limited(1024 * 1024)) catch {
        const name = try allocator.dupe(u8, "docker-build");
        const marker = try allocator.alloc(dockerfile_parser.StepMarker, 1);
        marker[0] = .{
            .name = name,
            .start_line = 1,
            .end_line = 1,
        };
        return marker;
    };
    defer allocator.free(content);

    return dockerfile_parser.DockerfileParser.parseSteps(allocator, content);
}

/// Frees the steps from a Dockerfile.
fn freeSteps(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The steps to free.
    steps: []dockerfile_parser.StepMarker,
) void {
    for (steps) |step| {
        allocator.free(step.name);
    }
    allocator.free(steps);
}

test "resolveImageRef defaults to platform tag" {
    const allocator = std.testing.allocator;
    var object: std.json.ObjectMap = .empty;
    defer object.deinit(allocator);

    const image_ref = try resolveImageRef(allocator, object, "api");
    defer allocator.free(image_ref);

    try std.testing.expectEqualStrings("naulite/api:latest", image_ref);
}

test "resolveContextPath defaults to service build directory" {
    const allocator = std.testing.allocator;
    var object: std.json.ObjectMap = .empty;
    defer object.deinit(allocator);

    const context_path = try resolveContextPath(allocator, object, "api");
    defer allocator.free(context_path);

    try std.testing.expectEqualStrings("/var/lib/naulite/builds/api", context_path);
}
