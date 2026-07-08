const logger = @import("logger");

const log_function = logger.Logger.create("function");

const std = @import("std");

const blocking_io = @import("blocking_io.zig");
const cp_client = @import("cp_client.zig");
const process_cmd = @import("process_cmd.zig");

const docker_api = @import("runtime/docker/docker_api.zig");

/// Result of a function task executed on the agent.
pub const FunctionTaskResult = struct {
    task_id: []const u8,
    status: []const u8,
    exit_code: i32,
    timed_out: bool,
    logs: ?[]const u8,
    error_message: ?[]const u8,
};

pub fn executeFunctionTask(
    allocator: std.mem.Allocator,
    docker_socket: []const u8,
    body: []const u8,
) !FunctionTaskResult {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidFunctionTask;
    }

    const task_id = try readStringField(allocator, root.object, "taskId", "function");
    errdefer allocator.free(task_id);

    const manifest_name = try readStringField(allocator, root.object, "manifestName", "manifest");
    defer allocator.free(manifest_name);

    const service_name = try readStringField(allocator, root.object, "serviceName", "service");
    defer allocator.free(service_name);

    const image = try readStringField(allocator, root.object, "image", "image");
    defer allocator.free(image);

    const timeout_ms = try readIntField(root.object, "timeoutMs", 60_000);

    const command = try readStringArrayField(allocator, root.object, "command");
    defer freeStringArray(allocator, command);

    const env_pairs = try readEnvObject(allocator, root.object, "environment");
    defer freeStringArray(allocator, env_pairs);

    const volume_binds_json = try buildVolumeBindsJson(allocator, root.object);
    defer allocator.free(volume_binds_json);

    const run_id = readOptionalStringField(root.object, "runId");
    const cp_url = readOptionalStringField(root.object, "cpUrl");
    const api_key = readOptionalStringField(root.object, "apiKey");

    log_function.debug(
        "execute taskId={s} service={s} image={s} timeoutMs={d} runId={s}",
        .{ task_id, service_name, image, timeout_ms, run_id orelse "-" },
    );

    const api = docker_api.DockerApi.init(allocator, docker_socket);

    const runtime_image = try resolveRuntimeDockerImage(allocator, image);
    defer allocator.free(runtime_image);

    try pullImageIfNeeded(allocator, &api, image, runtime_image, docker_socket, run_id, cp_url, api_key);

    const container_name = try std.fmt.allocPrint(allocator, "fn-{s}", .{task_id});
    defer allocator.free(container_name);

    const labels_json = try std.fmt.allocPrint(
        allocator,
        "{{\"naulite.task.type\":\"function\",\"naulite.function.service\":\"{s}\",\"naulite.function.manifest\":\"{s}\",\"naulite.task.id\":\"{s}\"}}",
        .{ service_name, manifest_name, task_id },
    );
    defer allocator.free(labels_json);

    const cmd_json = try stringArrayToJson(allocator, command);
    defer allocator.free(cmd_json);

    const env_json = try stringArrayToJson(allocator, env_pairs);
    defer allocator.free(env_json);

    const create_body = try std.fmt.allocPrint(
        allocator,
        "{{\"Image\":\"{s}\",\"Cmd\":{s},\"Env\":{s},\"Labels\":{s},\"HostConfig\":{{\"AutoRemove\":false,\"Binds\":{s}}}}}",
        .{ runtime_image, cmd_json, env_json, labels_json, volume_binds_json },
    );
    defer allocator.free(create_body);

    const create_path = try std.fmt.allocPrint(allocator, "/v1.44/containers/create?name={s}", .{container_name});
    defer allocator.free(create_path);

    var create_resp = try api.request("POST", create_path, create_body);
    defer create_resp.deinit(allocator);

    if (create_resp.status < 200 or create_resp.status >= 300) {
        const msg = try std.fmt.allocPrint(allocator, "Docker create failed status={d} body={s}", .{ create_resp.status, create_resp.body });
        return .{
            .task_id = task_id,
            .status = try allocator.dupe(u8, "failed"),
            .exit_code = 1,
            .timed_out = false,
            .logs = null,
            .error_message = msg,
        };
    }

    try api.startContainer(container_name);

    var exit_code: i32 = 0;
    var timed_out = false;
    var elapsed_ms: i64 = 0;

    while (true) {
        const state = try api.inspectContainerState(container_name);
        if (!state.running) {
            exit_code = state.exit_code;
            break;
        }

        if (elapsed_ms >= timeout_ms) {
            timed_out = true;
            break;
        }

        blocking_io.sleepMs(250);
        elapsed_ms += 250;
    }

    if (timed_out) {
        api.stopContainer(container_name) catch {};
        api.removeContainer(container_name, true) catch {};
        return .{
            .task_id = task_id,
            .status = try allocator.dupe(u8, "timed_out"),
            .exit_code = 124,
            .timed_out = true,
            .logs = null,
            .error_message = null,
        };
    }

    const logs_raw = fetchFunctionLogs(allocator, docker_socket, container_name) catch null;
    const logs = if (logs_raw) |raw| blk: {
        const decoded = docker_api.DockerApi.decodeDockerLogBytes(allocator, raw) catch {
            allocator.free(raw);
            break :blk null;
        };
        allocator.free(raw);
        break :blk decoded;
    } else null;
    api.removeContainer(container_name, true) catch {};

    return .{
        .task_id = task_id,
        .status = try allocator.dupe(u8, if (exit_code == 0) "completed" else "failed"),
        .exit_code = exit_code,
        .timed_out = false,
        .logs = logs,
        .error_message = null,
    };
}

const ContainerRegistrySpec = struct {
    name: []const u8,
    tag: []const u8,
};

fn parseContainerRegistryRef(allocator: std.mem.Allocator, image: []const u8) ?ContainerRegistrySpec {
    const prefix = "container-registry://";
    if (!std.mem.startsWith(u8, image, prefix)) {
        return null;
    }

    const remainder = image[prefix.len..];
    const separator = std.mem.lastIndexOfScalar(u8, remainder, ':') orelse return null;
    if (separator == 0 or separator >= remainder.len - 1) {
        return null;
    }

    const name = allocator.dupe(u8, remainder[0..separator]) catch return null;
    const tag = allocator.dupe(u8, remainder[separator + 1 ..]) catch {
        allocator.free(name);
        return null;
    };

    return .{ .name = name, .tag = tag };
}

fn resolveRuntimeDockerImage(allocator: std.mem.Allocator, image: []const u8) ![]const u8 {
    if (std.mem.startsWith(u8, image, "container-registry://")) {
        const spec = parseContainerRegistryRef(allocator, image) orelse return error.InvalidContainerRegistryRef;
        defer allocator.free(spec.name);
        defer allocator.free(spec.tag);
        return std.fmt.allocPrint(allocator, "naulite-cr/{s}:{s}", .{ spec.name, spec.tag });
    }

    return allocator.dupe(u8, image);
}

fn pullImageIfNeeded(
    allocator: std.mem.Allocator,
    api: *const docker_api.DockerApi,
    requested_image: []const u8,
    runtime_image: []const u8,
    docker_socket: []const u8,
    run_id: ?[]const u8,
    cp_url: ?[]const u8,
    api_key: ?[]const u8,
) !void {
    _ = run_id;
    if (std.mem.startsWith(u8, requested_image, "container-registry://")) {
        const url = cp_url orelse return error.MissingControlPlaneConfig;
        const key = api_key orelse return error.MissingControlPlaneConfig;

        const spec = parseContainerRegistryRef(allocator, requested_image) orelse return error.InvalidContainerRegistryRef;
        defer allocator.free(spec.name);
        defer allocator.free(spec.tag);

        const archive_path = try cp_client.getRegistryImage(allocator, url, spec.name, spec.tag, key);
        defer allocator.free(archive_path);
        defer std.Io.Dir.cwd().deleteFile(blocking_io.io(), archive_path) catch {};

        try runDockerLoad(allocator, docker_socket, archive_path);
        return;
    }

    if (std.mem.startsWith(u8, runtime_image, "naulite-cr/")) {
        return;
    }

    try api.pullImage(runtime_image);
}

fn runDockerLoad(allocator: std.mem.Allocator, docker_socket: []const u8, archive_path: []const u8) !void {
    const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
    defer allocator.free(docker_host);

    const args = [_][]const u8{ "docker", "-H", docker_host, "load", "-i", archive_path };
    try process_cmd.runCommandVoid(allocator, &args);
}

fn fetchFunctionLogs(
    allocator: std.mem.Allocator,
    docker_socket: []const u8,
    container_name: []const u8,
) ![]u8 {
    const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
    defer allocator.free(docker_host);

    const args = [_][]const u8{ "docker", "-H", docker_host, "logs", "--tail", "500", container_name };
    return process_cmd.runCommand(allocator, &args) catch |err| switch (err) {
        error.CommandFailed => return try allocator.dupe(u8, ""),
        else => return err,
    };
}

fn readStringField(
    allocator: std.mem.Allocator,
    obj: std.json.ObjectMap,
    key: []const u8,
    fallback: []const u8,
) ![]u8 {
    const value = obj.get(key) orelse {
        return allocator.dupe(u8, fallback);
    };
    return switch (value) {
        .string => |s| allocator.dupe(u8, s),
        else => allocator.dupe(u8, fallback),
    };
}

fn readOptionalStringField(obj: std.json.ObjectMap, key: []const u8) ?[]const u8 {
    const value = obj.get(key) orelse return null;
    return switch (value) {
        .string => |s| s,
        else => null,
    };
}

fn readIntField(obj: std.json.ObjectMap, key: []const u8, fallback: i64) !i64 {
    const value = obj.get(key) orelse return fallback;
    return switch (value) {
        .integer => |i| i,
        .float => |f| @intFromFloat(f),
        else => fallback,
    };
}

fn readStringArrayField(allocator: std.mem.Allocator, obj: std.json.ObjectMap, key: []const u8) ![]const []const u8 {
    const value = obj.get(key) orelse {
        return try allocator.alloc([]const u8, 0);
    };
    if (value != .array) {
        return try allocator.alloc([]const u8, 0);
    }

    const values = try allocator.alloc([]const u8, value.array.items.len);
    for (value.array.items, 0..) |item, index| {
        values[index] = switch (item) {
            .string => |s| try allocator.dupe(u8, s),
            else => try allocator.dupe(u8, ""),
        };
    }

    return values;
}

fn readEnvObject(allocator: std.mem.Allocator, obj: std.json.ObjectMap, key: []const u8) ![]const []const u8 {
    const value = obj.get(key) orelse {
        return try allocator.alloc([]const u8, 0);
    };
    if (value != .object) {
        return try allocator.alloc([]const u8, 0);
    }

    var output: std.ArrayList([]const u8) = .empty;
    defer output.deinit(allocator);

    var it = value.object.iterator();
    while (it.next()) |entry| {
        const env_value = switch (entry.value_ptr.*) {
            .string => |s| s,
            else => continue,
        };
        const pair = try std.fmt.allocPrint(allocator, "{s}={s}", .{ entry.key_ptr.*, env_value });
        try output.append(allocator, pair);
    }

    return try output.toOwnedSlice(allocator);
}

fn buildVolumeBindsJson(allocator: std.mem.Allocator, obj: std.json.ObjectMap) ![]u8 {
    const value = obj.get("volumeMounts") orelse return allocator.dupe(u8, "[]");
    if (value != .array or value.array.items.len == 0) {
        return allocator.dupe(u8, "[]");
    }

    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(allocator);
    try output.append(allocator, '[');

    for (value.array.items, 0..) |item, index| {
        if (item != .object) {
            continue;
        }
        const volume_name_value = item.object.get("volumeName") orelse continue;
        const mount_path_value = item.object.get("mountPath") orelse continue;
        const volume_name = switch (volume_name_value) {
            .string => |s| s,
            else => continue,
        };
        const mount_path = switch (mount_path_value) {
            .string => |s| s,
            else => continue,
        };
        const read_only = blk: {
            if (item.object.get("readOnly")) |ro| {
                break :blk switch (ro) {
                    .bool => |b| b,
                    else => false,
                };
            }
            break :blk false;
        };

        if (index > 0) {
            try output.append(allocator, ',');
        }

        const bind = if (read_only)
            try std.fmt.allocPrint(allocator, "\"{s}:{s}:ro\"", .{ volume_name, mount_path })
        else
            try std.fmt.allocPrint(allocator, "\"{s}:{s}\"", .{ volume_name, mount_path });
        defer allocator.free(bind);
        try output.appendSlice(allocator, bind);
    }

    try output.append(allocator, ']');
    return try output.toOwnedSlice(allocator);
}

fn stringArrayToJson(allocator: std.mem.Allocator, values: []const []const u8) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(allocator);
    try out.append(allocator, '[');
    for (values, 0..) |value, index| {
        if (index > 0) try out.append(allocator, ',');
        const literal = try jsonStringLiteral(allocator, value);
        defer allocator.free(literal);
        try out.appendSlice(allocator, literal);
    }
    try out.append(allocator, ']');
    return try out.toOwnedSlice(allocator);
}

fn jsonStringLiteral(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(allocator);
    try output.append(allocator, '"');
    for (value) |char| {
        switch (char) {
            '"' => try output.appendSlice(allocator, "\\\""),
            '\\' => try output.appendSlice(allocator, "\\\\"),
            '\n' => try output.appendSlice(allocator, "\\n"),
            '\r' => try output.appendSlice(allocator, "\\r"),
            '\t' => try output.appendSlice(allocator, "\\t"),
            else => try output.append(allocator, char),
        }
    }
    try output.append(allocator, '"');
    return try output.toOwnedSlice(allocator);
}

fn freeStringArray(allocator: std.mem.Allocator, values: []const []const u8) void {
    for (values) |value| {
        allocator.free(value);
    }
    allocator.free(values);
}

