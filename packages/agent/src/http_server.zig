const std = @import("std");

const backup_executor = @import("backup_executor.zig");
const bootstrap = @import("bootstrap.zig");
const execution_plan = @import("execution_plan.zig");
const log_rotation_executor = @import("log_rotation_executor.zig");
const docker = @import("runtime/docker.zig");

pub const Config = struct {
    listen_address: []const u8 = "0.0.0.0",
    listen_port: u16 = 9470,
    docker_socket: []const u8 = "/var/run/docker.sock",
};

pub const HttpResponse = struct {
    status: u16,
    content_type: []const u8,
    body: []const u8,
};

const RouteContext = struct {
    allocator: std.mem.Allocator,
    docker_client: *docker.DockerClient,
};

/// Builds the JSON body for GET /health.
pub fn healthResponseBody() []const u8 {
    return "{\"status\":\"ok\",\"service\":\"platform-agent\"}";
}

/// Handles an HTTP request and returns a response without binding a socket.
pub fn handleRequest(
    allocator: std.mem.Allocator,
    docker_client: *docker.DockerClient,
    method: []const u8,
    path: []const u8,
    body: []const u8,
) !HttpResponse {
    const ctx = RouteContext{
        .allocator = allocator,
        .docker_client = docker_client,
    };

    if (std.mem.eql(u8, method, "GET") and std.mem.eql(u8, path, "/health")) {
        return .{
            .status = 200,
            .content_type = "application/json",
            .body = try allocator.dupe(u8, healthResponseBody()),
        };
    }

    if (std.mem.eql(u8, method, "GET") and std.mem.eql(u8, path, "/metrics")) {
        const metrics_body = try std.fmt.allocPrint(
            allocator,
            "# HELP platform_agent_up Agent process is running.\n# TYPE platform_agent_up gauge\nplatform_agent_up 1\n",
            .{},
        );

        return .{
            .status = 200,
            .content_type = "text/plain; version=0.0.4",
            .body = metrics_body,
        };
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/execution/apply")) {
        return try handleExecutionApply(&ctx, body);
    }

    if (std.mem.eql(u8, method, "GET") and std.mem.startsWith(u8, path, "/containers/") and std.mem.endsWith(u8, path, "/logs")) {
        return try handleContainerLogs(&ctx, path);
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.endsWith(u8, path, "/exec")) {
        return try handleContainerExec(&ctx, path, body);
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/tasks/backup")) {
        return try handleBackupTask(&ctx, body);
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/tasks/log-rotation")) {
        return try handleLogRotationTask(&ctx, body);
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/backups/receive")) {
        return try handleBackupReceive(&ctx, body);
    }

    if (std.mem.eql(u8, method, "POST") and std.mem.eql(u8, path, "/bootstrap/status")) {
        return try handleBootstrapStatus(&ctx);
    }

    const not_found = try std.fmt.allocPrint(allocator, "{{\"error\":\"not found\",\"path\":\"{s}\"}}", .{path});
    return .{
        .status = 404,
        .content_type = "application/json",
        .body = not_found,
    };
}

/// Starts the REST HTTP server and blocks until interrupted.
pub fn serve(allocator: std.mem.Allocator, config: Config) !void {
    var docker_client = docker.DockerClient.init(allocator, config.docker_socket);

    const address = try std.net.Address.parseIp4(config.listen_address, config.listen_port);
    var server = try address.listen(.{
        .reuse_address = true,
    });
    defer server.deinit();

    std.log.info("[http] listening on {s}:{d}", .{ config.listen_address, config.listen_port });

    while (true) {
        const connection = try server.accept();
        defer connection.stream.close();

        var read_buffer: [4096]u8 = undefined;
        var http_server = std.http.Server.init(connection, &read_buffer);
        var request = http_server.receiveHead() catch |err| {
            std.log.warn("[http] failed to read request head: {}", .{err});
            continue;
        };

        const method = methodToString(request.head.method);
        const target = request.head.target;

        var request_arena = std.heap.ArenaAllocator.init(allocator);
        defer request_arena.deinit();
        const request_allocator = request_arena.allocator();

        const body = try readRequestBody(request_allocator, &request);
        const path = try normalizePath(request_allocator, target);

        const response = handleRequest(request_allocator, &docker_client, method, path, body) catch |err| {
            std.log.err("[http] handler failed: {}", .{err});
            try writeResponse(&request, 500, "application/json", "{\"error\":\"internal server error\"}");
            continue;
        };
        defer request_allocator.free(response.body);

        try writeResponse(&request, response.status, response.content_type, response.body);
    }
}

fn handleExecutionApply(ctx: *const RouteContext, body: []const u8) !HttpResponse {
    var plan = try execution_plan.parseExecutionPlan(ctx.allocator, body);
    defer plan.deinit(ctx.allocator);

    try ctx.docker_client.applyPlan(plan);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"accepted\":true,\"planId\":\"{s}\",\"revision\":{d}}}",
        .{ plan.plan_id, plan.revision },
    );

    return .{
        .status = 202,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleContainerLogs(ctx: *const RouteContext, path: []const u8) !HttpResponse {
    const instance_id = try extractContainerId(ctx.allocator, path);
    defer ctx.allocator.free(instance_id);

    const logs = try ctx.docker_client.getContainerLogs(instance_id, null);
    defer ctx.allocator.free(logs);

    const logs_literal = try jsonStringLiteral(ctx.allocator, logs);
    defer ctx.allocator.free(logs_literal);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"instanceId\":\"{s}\",\"logs\":{s}}}",
        .{ instance_id, logs_literal },
    );

    return .{
        .status = 200,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleContainerExec(ctx: *const RouteContext, path: []const u8, body: []const u8) !HttpResponse {
    const instance_id = try extractContainerId(ctx.allocator, path);
    defer ctx.allocator.free(instance_id);

    const command = try parseStringArrayField(ctx.allocator, body, "command");
    defer ctx.allocator.free(command);

    const result = try ctx.docker_client.execContainer(instance_id, command);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"instanceId\":\"{s}\",\"exitCode\":{d},\"stdout\":\"{s}\",\"stderr\":\"{s}\"}}",
        .{ instance_id, result.exit_code, result.stdout, result.stderr },
    );

    return .{
        .status = 200,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleBackupTask(ctx: *const RouteContext, body: []const u8) !HttpResponse {
    const result = try backup_executor.executeBackupTask(ctx.allocator, body);
    defer ctx.allocator.free(result.task_id);
    defer ctx.allocator.free(result.status);
    if (result.archive_path) |archive_path| ctx.allocator.free(archive_path);
    if (result.error_message) |error_message| ctx.allocator.free(error_message);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"taskId\":\"{s}\",\"status\":\"{s}\"}}",
        .{ result.task_id, result.status },
    );

    return .{
        .status = 202,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleLogRotationTask(ctx: *const RouteContext, body: []const u8) !HttpResponse {
    const result = try log_rotation_executor.executeLogRotationTask(ctx.allocator, body);
    defer ctx.allocator.free(result.task_id);
    defer ctx.allocator.free(result.status);
    defer ctx.allocator.free(result.rotated_files);
    if (result.error_message) |error_message| ctx.allocator.free(error_message);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"taskId\":\"{s}\",\"status\":\"{s}\",\"rotatedFiles\":[]}}",
        .{ result.task_id, result.status },
    );

    return .{
        .status = 202,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleBackupReceive(ctx: *const RouteContext, body: []const u8) !HttpResponse {
    const stored_path = try backup_executor.receiveBackupArchive(ctx.allocator, body);
    defer ctx.allocator.free(stored_path);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"storedPath\":\"{s}\"}}",
        .{stored_path},
    );

    return .{
        .status = 201,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn handleBootstrapStatus(ctx: *const RouteContext) !HttpResponse {
    var status = try bootstrap.collectStatus(ctx.allocator);
    defer ctx.allocator.free(status.os_version);

    const response_body = try std.fmt.allocPrint(
        ctx.allocator,
        "{{\"os\":\"{s}\",\"osVersion\":\"{s}\",\"arch\":\"{s}\",\"dockerAvailable\":{},\"netbirdConnected\":{},\"agentVersion\":\"{s}\"}}",
        .{
            @tagName(status.os),
            status.os_version,
            status.arch,
            status.docker_available,
            status.netbird_connected,
            status.agent_version,
        },
    );

    return .{
        .status = 200,
        .content_type = "application/json",
        .body = response_body,
    };
}

fn readRequestBody(allocator: std.mem.Allocator, request: *std.http.Server.Request) ![]const u8 {
    const content_length = request.head.content_length orelse 0;
    if (content_length == 0) return &[_]u8{};

    const body = try allocator.alloc(u8, content_length);
    var index: usize = 0;

    while (index < content_length) {
        const read_count = try request.reader().read(body[index..]);
        if (read_count == 0) return error.EndOfStream;
        index += read_count;
    }

    return body;
}

fn normalizePath(allocator: std.mem.Allocator, target: []const u8) ![]const u8 {
    const query_index = std.mem.indexOfScalar(u8, target, '?') orelse target.len;
    return try allocator.dupe(u8, target[0..query_index]);
}

fn extractContainerId(allocator: std.mem.Allocator, path: []const u8) ![]u8 {
    const prefix = "/containers/";
    if (!std.mem.startsWith(u8, path, prefix)) return error.InvalidContainerPath;

    const remainder = path[prefix.len..];
    const slash_index = std.mem.indexOfScalar(u8, remainder, '/') orelse return error.InvalidContainerPath;
    return try allocator.dupe(u8, remainder[0..slash_index]);
}

fn parseStringArrayField(allocator: std.mem.Allocator, body: []const u8, field_name: []const u8) ![]const []const u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) return error.InvalidRequestBody;

    const field = root.object.get(field_name) orelse return error.MissingField;
    if (field != .array) return error.InvalidFieldType;

    const values = try allocator.alloc([]const u8, field.array.items.len);
    for (field.array.items, 0..) |item, index| {
        values[index] = switch (item) {
            .string => |s| try allocator.dupe(u8, s),
            else => return error.InvalidFieldType,
        };
    }

    return values;
}

fn writeResponse(
    request: *std.http.Server.Request,
    status: u16,
    content_type: []const u8,
    body: []const u8,
) !void {
    try request.respond(body, .{
        .status = httpStatusFromCode(status),
        .extra_headers = &.{
            .{ .name = "content-type", .value = content_type },
        },
    });
}

fn methodToString(method: std.http.Method) []const u8 {
    return switch (method) {
        .GET => "GET",
        .POST => "POST",
        .PUT => "PUT",
        .PATCH => "PATCH",
        .DELETE => "DELETE",
        .HEAD => "HEAD",
        .OPTIONS => "OPTIONS",
        else => "UNKNOWN",
    };
}

fn httpStatusFromCode(status: u16) std.http.Status {
    return switch (status) {
        200 => .ok,
        201 => .created,
        202 => .accepted,
        404 => .not_found,
        500 => .internal_server_error,
        else => .internal_server_error,
    };
}

fn jsonStringLiteral(allocator: std.mem.Allocator, value: []const u8) ![]const u8 {
    return try std.fmt.allocPrint(allocator, "\"{s}\"", .{value});
}

test "health handler returns ok payload" {
    const allocator = std.testing.allocator;
    var docker_client = docker.DockerClient.init(allocator, "/var/run/docker.sock");

    const response = try handleRequest(allocator, &docker_client, "GET", "/health", "");
    defer allocator.free(response.body);

    try std.testing.expectEqual(@as(u16, 200), response.status);
    try std.testing.expectEqualStrings("application/json", response.content_type);
    try std.testing.expectEqualStrings(healthResponseBody(), response.body);
}

test "unknown route returns 404" {
    const allocator = std.testing.allocator;
    var docker_client = docker.DockerClient.init(allocator, "/var/run/docker.sock");

    const response = try handleRequest(allocator, &docker_client, "GET", "/missing", "");
    defer allocator.free(response.body);

    try std.testing.expectEqual(@as(u16, 404), response.status);
}
