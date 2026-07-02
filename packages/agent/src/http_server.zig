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
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var docker_client = docker.DockerClient.init(allocator, config.docker_socket);

    var address = try std.Io.net.IpAddress.parseIp4(config.listen_address, config.listen_port);
    var server = try address.listen(io, .{ .reuse_address = true });
    defer server.deinit(io);

    std.log.info("[http] listening on {s}:{d}", .{ config.listen_address, config.listen_port });

    while (true) {
        var stream = server.accept(io) catch |err| {
            std.log.warn("[http] accept failed: {}", .{err});
            continue;
        };

        handleConnection(allocator, io, &docker_client, &stream) catch |err| {
            std.log.warn("[http] connection failed: {}", .{err});
        };
        stream.close(io);
    }
}

fn handleConnection(
    allocator: std.mem.Allocator,
    io: std.Io,
    docker_client: *docker.DockerClient,
    stream: *std.Io.net.Stream,
) !void {
    var received: std.ArrayList(u8) = .empty;
    defer received.deinit(allocator);

    var read_buffer: [4096]u8 = undefined;
    var net_reader = stream.reader(io, &read_buffer);

    while (true) {
        var chunk: [1024]u8 = undefined;
        const read_count = std.Io.Reader.readSliceShort(&net_reader.interface, chunk[0..]) catch |err| {
            return err;
        };
        if (read_count == 0) break;
        try received.appendSlice(allocator, chunk[0..read_count]);
        if (std.mem.indexOf(u8, received.items, "\r\n\r\n") != null) break;
        if (received.items.len >= 1024 * 1024) return error.RequestTooLarge;
    }

    if (received.items.len == 0) return;

    const header_end = std.mem.indexOf(u8, received.items, "\r\n\r\n") orelse return error.InvalidHttpRequest;
    const header_section = received.items[0..header_end];

    const request_line_end = std.mem.indexOfScalar(u8, header_section, '\n') orelse return error.InvalidHttpRequest;
    const request_line = std.mem.trim(u8, header_section[0..request_line_end], "\r");

    var request_parts = std.mem.tokenizeScalar(u8, request_line, ' ');
    const method = request_parts.next() orelse return error.InvalidHttpRequest;
    const target = request_parts.next() orelse return error.InvalidHttpRequest;

    const content_length = try parseContentLength(header_section);
    const body_start = header_end + 4;
    var body_owned: ?[]u8 = null;
    defer if (body_owned) |owned| allocator.free(owned);

    const body: []const u8 = blk: {
        if (content_length == 0) break :blk &[_]u8{};

        if (received.items.len >= body_start + content_length) {
            break :blk received.items[body_start .. body_start + content_length];
        }

        const owned = try allocator.alloc(u8, content_length);
        body_owned = owned;
        const already_read = received.items.len - body_start;
        if (already_read > 0) {
            @memcpy(owned[0..already_read], received.items[body_start..]);
        }

        var index = already_read;
        while (index < content_length) {
            var chunk: [1024]u8 = undefined;
            const read_count = std.Io.Reader.readSliceShort(&net_reader.interface, chunk[0..]) catch |err| {
                return err;
            };
            if (read_count == 0) return error.EndOfStream;
            @memcpy(owned[index .. index + read_count], chunk[0..read_count]);
            index += read_count;
        }

        break :blk owned;
    };

    var request_arena = std.heap.ArenaAllocator.init(allocator);
    defer request_arena.deinit();
    const request_allocator = request_arena.allocator();

    const path = try normalizePath(request_allocator, target);

    const response = handleRequest(request_allocator, docker_client, method, path, body) catch |err| {
        std.log.err("[http] handler failed: {}", .{err});
        try writeRawResponse(io, stream, 500, "Internal Server Error", "application/json", "{\"error\":\"internal server error\"}");
        return;
    };
    defer request_allocator.free(response.body);

    try writeRawResponse(io, stream, response.status, statusText(response.status), response.content_type, response.body);
}

fn handleExecutionApply(ctx: *const RouteContext, body: []const u8) !HttpResponse {
    var plan = try execution_plan.parseExecutionPlan(ctx.allocator, body);
    defer plan.deinit(ctx.allocator);

    ctx.docker_client.applyPlan(plan) catch |err| {
        std.log.err("[http] execution apply failed: {}", .{err});
        const response_body = try std.fmt.allocPrint(
            ctx.allocator,
            "{{\"accepted\":false,\"planId\":\"{s}\",\"message\":\"apply failed\"}}",
            .{plan.plan_id},
        );
        return .{
            .status = 500,
            .content_type = "application/json",
            .body = response_body,
        };
    };

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
    const status = try bootstrap.collectStatus(ctx.allocator);
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

fn parseContentLength(header_section: []const u8) !usize {
    var lines = std.mem.splitSequence(u8, header_section, "\r\n");
    _ = lines.next();

    while (lines.next()) |line| {
        if (line.len == 0) continue;
        const colon = std.mem.indexOfScalar(u8, line, ':') orelse continue;
        const name = std.mem.trim(u8, line[0..colon], " ");
        if (std.ascii.eqlIgnoreCase(name, "content-length")) {
            const value = std.mem.trim(u8, line[colon + 1 ..], " ");
            return try std.fmt.parseInt(usize, value, 10);
        }
    }

    return 0;
}

fn writeRawResponse(
    io: std.Io,
    stream: *std.Io.net.Stream,
    status: u16,
    status_text: []const u8,
    content_type: []const u8,
    body: []const u8,
) !void {
    var write_buffer: [4096]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);

    try std.Io.Writer.print(
        &net_writer.interface,
        "HTTP/1.1 {d} {s}\r\nContent-Type: {s}\r\nContent-Length: {d}\r\nConnection: close\r\n\r\n{s}",
        .{ status, status_text, content_type, body.len, body },
    );
    try std.Io.Writer.flush(&net_writer.interface);
}

fn statusText(status: u16) []const u8 {
    return switch (status) {
        200 => "OK",
        201 => "Created",
        202 => "Accepted",
        404 => "Not Found",
        500 => "Internal Server Error",
        else => "OK",
    };
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
