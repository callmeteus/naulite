const std = @import("std");

const agent_config = @import("agent_config.zig");
const bootstrap = @import("bootstrap.zig");
const docker = @import("runtime/docker/docker.zig");
const env_util = @import("env_util.zig");

/// Control plane client configuration (persisted agent identity and connectivity).
pub const Config = agent_config.AgentConfig;

/// Loads agent configuration from disk and environment variables.
pub fn loadConfig(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Detected operating system family.
    os: bootstrap.OsFamily,
) !Config {
    return agent_config.load(allocator, io, os);
}

/// Loads agent configuration for call sites without an existing I/O handle.
pub fn loadConfigSnapshot(allocator: std.mem.Allocator) ?Config {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    const os = bootstrap.detectOsFamily();
    return agent_config.load(allocator, threaded.io(), os) catch null;
}

/// Starts background registration and heartbeat loop against the control plane.
pub fn startBackground(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Mutable agent configuration shared with the main process.
    config: *Config,
) !void {
    const thread = try std.Thread.spawn(.{}, backgroundLoop, .{ allocator, io, config });
    thread.detach();
}

fn backgroundLoop(
    allocator: std.mem.Allocator,
    io: std.Io,
    config: *Config,
) void {
    while (true) {
        registerNode(allocator, io, config) catch |err| {
            std.log.warn("[cp] register failed: {}", .{err});
            std.Io.Timeout.sleep(.{
                .duration = .{
                    .raw = std.Io.Duration.fromSeconds(2),
                    .clock = .real,
                },
            }, io) catch {};
            continue;
        };

        while (true) {
            sendHeartbeat(allocator, io, config.*) catch |err| {
                std.log.warn("[cp] heartbeat failed: {}", .{err});
                break;
            };
            std.Io.Timeout.sleep(.{
                .duration = .{
                    .raw = std.Io.Duration.fromSeconds(30),
                    .clock = .real,
                },
            }, io) catch {};
        }
    }
}

fn registerNode(
    allocator: std.mem.Allocator,
    io: std.Io,
    config: *Config,
) !void {
    const resources = collectResources(allocator, config.docker_socket);
    const labels_json = buildLabelsJson(allocator) catch "{}";
    defer allocator.free(labels_json);

    const capabilities_json = buildCapabilitiesJson(allocator) catch "[\"docker\"]";
    defer allocator.free(capabilities_json);

    const netbird_device_json = if (config.netbird_device_id) |device_id|
        try std.fmt.allocPrint(allocator, ",\"netbirdDeviceId\":\"{s}\"", .{device_id})
    else
        try allocator.dupe(u8, "");
    defer allocator.free(netbird_device_json);

    const resources_json = try formatResourcesJson(allocator, resources);
    defer allocator.free(resources_json);

    const register_fmt =
        \\{{"id":"{s}","hostname":"{s}","agentVersion":"{s}","agentUrl":"{s}","labels":{s},"capabilities":{s},"resources":{s}{s}}}
    ;
    const body = try std.fmt.allocPrint(
        allocator,
        register_fmt,
        .{
            config.node_id,
            config.hostname,
            config.agent_version,
            config.agent_url,
            labels_json,
            capabilities_json,
            resources_json,
            netbird_device_json,
        },
    );
    defer allocator.free(body);

    const path = try std.fmt.allocPrint(allocator, "{s}/nodes/register", .{config.cp_url});
    defer allocator.free(path);

    const response_body = try postJson(allocator, io, path, body, config.api_key);
    defer allocator.free(response_body);

    try agent_config.applyRegistrationResponse(allocator, config, response_body);
    try agent_config.save(allocator, io, config);

    std.log.info("[cp] registered node id={s} url={s}", .{ config.node_id, config.agent_url });
}

fn sendHeartbeat(
    allocator: std.mem.Allocator,
    io: std.Io,
    config: Config,
) !void {
    const resources = collectResources(allocator, config.docker_socket);

    const resources_json = try formatResourcesJson(allocator, resources);
    defer allocator.free(resources_json);

    const heartbeat_fmt =
        \\{{"status":"online","resources":{s}}}
    ;
    const body = try std.fmt.allocPrint(
        allocator,
        heartbeat_fmt,
        .{resources_json},
    );
    defer allocator.free(body);

    const path = try std.fmt.allocPrint(
        allocator,
        "{s}/nodes/{s}/heartbeat",
        .{ config.cp_url, config.node_id },
    );
    defer allocator.free(path);

    const response_body = try postJson(allocator, io, path, body, config.api_key);
    defer allocator.free(response_body);
}

fn collectResources(
    allocator: std.mem.Allocator,
    docker_socket: []const u8,
) docker.ResourceSnapshot {
    var docker_client = docker.DockerClient.init(allocator, docker_socket);
    return docker_client.collectNodeResources() catch {
        std.log.debug("[cp] docker stats unavailable socket={s} using fallback", .{docker_socket});
        return fallbackResources();
    };
}

fn fallbackResources() docker.ResourceSnapshot {
    return .{
        .cpu_millis_total = 1000,
        .cpu_millis_used = 0,
        .memory_mb_total = 1024,
        .memory_mb_used = 0,
        .disk_mb_total = 102_400,
        .disk_mb_used = 0,
    };
}

fn formatResourcesJson(allocator: std.mem.Allocator, resources: docker.ResourceSnapshot) ![]u8 {
    const fmt =
        \\{{"cpuMillisTotal":{d},"cpuMillisUsed":{d},"memoryMbTotal":{d},"memoryMbUsed":{d},"diskMbTotal":{d},"diskMbUsed":{d}}}
    ;
    return std.fmt.allocPrint(allocator, fmt, .{
        resources.cpu_millis_total,
        resources.cpu_millis_used,
        resources.memory_mb_total,
        resources.memory_mb_used,
        resources.disk_mb_total,
        resources.disk_mb_used,
    });
}

fn buildLabelsJson(allocator: std.mem.Allocator) ![]const u8 {
    if (env_util.readEnvOptional(allocator, "PLATFORM_NODE_LABELS")) |raw| {
        defer allocator.free(raw);
        return try allocator.dupe(u8, raw);
    }

    return try allocator.dupe(u8, "{}");
}

fn buildCapabilitiesJson(allocator: std.mem.Allocator) ![]const u8 {
    if (env_util.readEnvOptional(allocator, "PLATFORM_CAPABILITIES")) |raw| {
        defer allocator.free(raw);

        var list = std.ArrayListUnmanaged([]const u8).empty;
        errdefer {
            for (list.items) |item| {
                allocator.free(item);
            }
            list.deinit(allocator);
        }

        var parts = std.mem.splitScalar(u8, raw, ',');
        while (parts.next()) |part| {
            const trimmed = std.mem.trim(u8, part, " \t\r\n");
            if (trimmed.len == 0) {
                continue;
            }
            try list.append(allocator, try allocator.dupe(u8, trimmed));
        }

        if (list.items.len == 0) {
            return try allocator.dupe(u8, "[]");
        }

        var json = std.ArrayListUnmanaged(u8).empty;
        defer json.deinit(allocator);
        try json.append(allocator, '[');
        for (list.items, 0..) |item, index| {
            if (index > 0) {
                try json.append(allocator, ',');
            }
            try json.appendSlice(allocator, "\"");
            try json.appendSlice(allocator, item);
            try json.appendSlice(allocator, "\"");
            allocator.free(item);
        }
        try json.append(allocator, ']');
        return try json.toOwnedSlice(allocator);
    }

    if (bootstrap.probeDockerSocket()) {
        return try allocator.dupe(u8, "[\"docker\"]");
    }

    return try allocator.dupe(u8, "[]");
}

fn reportInstanceStatus(
    allocator: std.mem.Allocator,
    io: std.Io,
    config: Config,
    instance_id: []const u8,
    status: []const u8,
) void {
    const path = std.fmt.allocPrint(
        allocator,
        "{s}/instances/{s}/status",
        .{ config.cp_url, instance_id },
    ) catch {
        return;
    };
    defer allocator.free(path);

    const status_fmt =
        \\{{"status":"{s}"}}
    ;
    const body = std.fmt.allocPrint(
        allocator,
        status_fmt,
        .{status},
    ) catch {
        return;
    };
    defer allocator.free(body);

    if (postJson(allocator, io, path, body, config.api_key)) |response| {
        defer allocator.free(response);
    } else |err| {
        std.log.warn("[cp] instance status report failed id={s} status={s} err={}", .{ instance_id, status, err });
    }
}

pub fn reportInstanceRunning(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Instance identifier to report.
    instance_id: []const u8,
) void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    reportInstanceStatus(allocator, threaded.io(), config, instance_id, "running");
}

pub fn reportInstanceStopped(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Instance identifier to report.
    instance_id: []const u8,
) void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    reportInstanceStatus(allocator, threaded.io(), config, instance_id, "stopped");
}

pub fn reportInstanceFailed(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Instance identifier to report.
    instance_id: []const u8,
) void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    reportInstanceStatus(allocator, threaded.io(), config, instance_id, "failed");
}

/// Reports a pipeline run event to the control plane.
pub fn reportRunEvent(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Pipeline run identifier.
    run_id: []const u8,
    // Event kind string.
    kind: []const u8,
    // Optional step name.
    step_name: ?[]const u8,
    // Optional message payload.
    message: ?[]const u8,
    // Optional step log text payload.
    log_text: ?[]const u8,
) void {
    reportRunEventUrl(
        allocator,
        config.cp_url,
        run_id,
        kind,
        step_name,
        message,
        log_text,
        config.api_key,
    );
}

/// Reports a pipeline run event using an explicit control plane URL.
pub fn reportRunEventUrl(
    allocator: std.mem.Allocator,
    cp_url: []const u8,
    run_id: []const u8,
    kind: []const u8,
    step_name: ?[]const u8,
    message: ?[]const u8,
    log_text: ?[]const u8,
    api_key: ?[]const u8,
) void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    reportRunEventIo(allocator, threaded.io(), cp_url, run_id, kind, step_name, message, log_text, api_key);
}

fn reportRunEventIo(
    allocator: std.mem.Allocator,
    io: std.Io,
    cp_url: []const u8,
    run_id: []const u8,
    kind: []const u8,
    step_name: ?[]const u8,
    message: ?[]const u8,
    log_text: ?[]const u8,
    api_key: ?[]const u8,
) void {
    const path = std.fmt.allocPrint(
        allocator,
        "{s}/runs/{s}/events",
        .{ cp_url, run_id },
    ) catch {
        return;
    };
    defer allocator.free(path);

    const body = buildRunEventBody(allocator, kind, step_name, message, log_text) catch {
        return;
    };
    defer allocator.free(body);

    if (postJson(allocator, io, path, body, api_key)) |response| {
        defer allocator.free(response);
    } else |err| {
        std.log.warn(
            "[cp] run event report failed runId={s} kind={s} err={}",
            .{ run_id, kind, err },
        );
    }
}

fn buildRunEventBody(
    allocator: std.mem.Allocator,
    kind: []const u8,
    step_name: ?[]const u8,
    message: ?[]const u8,
    log_text: ?[]const u8,
) ![]u8 {
    var parts = std.ArrayList(u8).empty;
    var aw = std.Io.Writer.Allocating.fromArrayList(allocator, &parts);
    defer aw.deinit();

    const message_text = message orelse kind;
    try aw.writer.writeAll("{\"kind\":\"");
    try aw.writer.writeAll(kind);
    try aw.writer.writeAll("\"");

    if (step_name) |name| {
        try aw.writer.writeAll(",\"stepName\":\"");
        try aw.writer.writeAll(name);
        try aw.writer.writeAll("\"");
    }

    try aw.writer.writeAll(",\"message\":\"");
    try writeJsonEscaped(&aw.writer, message_text);
    try aw.writer.writeAll("\"");

    if (log_text) |logs| {
        try aw.writer.writeAll(",\"logText\":\"");
        try writeJsonEscaped(&aw.writer, logs);
        try aw.writer.writeAll("\"");
    }

    try aw.writer.writeAll("}");
    parts = aw.toArrayList();
    return try parts.toOwnedSlice(allocator);
}

fn writeJsonEscaped(writer: anytype, value: []const u8) !void {
    for (value) |byte| {
        switch (byte) {
            '"' => try writer.writeAll("\\\""),
            '\\' => try writer.writeAll("\\\\"),
            '\n' => try writer.writeAll("\\n"),
            '\r' => try writer.writeAll("\\r"),
            '\t' => try writer.writeAll("\\t"),
            else => try writer.writeByte(byte),
        }
    }
}

fn receiveHttpHead(req: *std.http.Client.Request) !std.http.Client.Response {
    var redirect_buffer: [8192]u8 = undefined;
    return try req.receiveHead(&redirect_buffer);
}

fn readHttpBodyToSlice(
    allocator: std.mem.Allocator,
    response: *std.http.Client.Response,
    max_bytes: usize,
) ![]u8 {
    var transfer_buffer: [65536]u8 = undefined;
    const body_reader = response.reader(&transfer_buffer);

    var body = std.ArrayList(u8).empty;
    errdefer body.deinit(allocator);

    var chunk: [8192]u8 = undefined;
    while (body.items.len < max_bytes) {
        const read_count = try std.Io.Reader.readSliceShort(body_reader, chunk[0..]);
        if (read_count == 0) {
            break;
        }
        try body.appendSlice(allocator, chunk[0..read_count]);
    }

    return try body.toOwnedSlice(allocator);
}

fn writeHttpBodyToFile(
    io: std.Io,
    response: *std.http.Client.Response,
    archive_path: []const u8,
) !void {
    var transfer_buffer: [65536]u8 = undefined;
    const body_reader = response.reader(&transfer_buffer);

    var file = try std.Io.Dir.cwd().createFile(io, archive_path, .{});
    defer file.close(io);

    var write_buffer: [65536]u8 = undefined;
    var file_writer = file.writer(io, &write_buffer);

    var chunk: [8192]u8 = undefined;
    while (true) {
        const read_count = try std.Io.Reader.readSliceShort(body_reader, chunk[0..]);
        if (read_count == 0) {
            break;
        }
        try file_writer.interface.writeAll(chunk[0..read_count]);
    }
    try file_writer.interface.flush();
}

fn postJson(
    allocator: std.mem.Allocator,
    io: std.Io,
    // Full request URL.
    url: []const u8,
    // JSON request body.
    body: []const u8,
    // Optional API key for authenticated control plane routes.
    api_key: ?[]const u8,
) ![]u8 {
    const uri = try std.Uri.parse(url);
    var client = std.http.Client{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    var auth_value: ?[]const u8 = null;
    defer if (auth_value) |value| allocator.free(value);

    var headers_buf: [3]std.http.Header = undefined;
    var header_count: usize = 2;
    headers_buf[0] = .{ .name = "accept", .value = "application/json" };
    headers_buf[1] = .{ .name = "content-type", .value = "application/json" };

    if (api_key) |token| {
        auth_value = try std.fmt.allocPrint(allocator, "Bearer {s}", .{token});
        headers_buf[2] = .{ .name = "authorization", .value = auth_value.? };
        header_count = 3;
    }

    var req = try client.request(.POST, uri, .{
        .extra_headers = headers_buf[0..header_count],
    });
    defer req.deinit();

    try req.sendBodyComplete(try allocator.dupe(u8, body));

    var response = try receiveHttpHead(&req);

    if (response.head.status.class() != .success and response.head.status != .created) {
        std.log.err("[cp] request failed status={} url={s}", .{ response.head.status, url });
        return error.ControlPlaneRequestFailed;
    }

    return try readHttpBodyToSlice(allocator, &response, 1024 * 1024);
}

/// Uploads a docker save tarball to the control plane container registry.
pub fn putRegistryImage(
    allocator: std.mem.Allocator,
    cp_url: []const u8,
    name: []const u8,
    tag: []const u8,
    body: []const u8,
    api_key: ?[]const u8,
) !void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    try putRegistryImageIo(allocator, threaded.io(), cp_url, name, tag, body, api_key);
}

/// Downloads a docker save tarball from the control plane container registry.
pub fn getRegistryImage(
    allocator: std.mem.Allocator,
    cp_url: []const u8,
    name: []const u8,
    tag: []const u8,
    api_key: ?[]const u8,
) ![]u8 {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    return try getRegistryImageIo(allocator, threaded.io(), cp_url, name, tag, api_key);
}

fn putRegistryImageIo(
    allocator: std.mem.Allocator,
    io: std.Io,
    cp_url: []const u8,
    name: []const u8,
    tag: []const u8,
    body: []const u8,
    api_key: ?[]const u8,
) !void {
    const path = try std.fmt.allocPrint(allocator, "{s}/cr/images/{s}/{s}", .{ cp_url, name, tag });
    defer allocator.free(path);

    const uri = try std.Uri.parse(path);
    var client = std.http.Client{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    var auth_value: ?[]const u8 = null;
    defer if (auth_value) |value| allocator.free(value);

    var headers_buf: [3]std.http.Header = undefined;
    var header_count: usize = 2;
    headers_buf[0] = .{ .name = "accept", .value = "application/json" };
    headers_buf[1] = .{ .name = "content-type", .value = "application/octet-stream" };

    if (api_key) |token| {
        auth_value = try std.fmt.allocPrint(allocator, "Bearer {s}", .{token});
        headers_buf[2] = .{ .name = "authorization", .value = auth_value.? };
        header_count = 3;
    }

    var req = try client.request(.PUT, uri, .{
        .extra_headers = headers_buf[0..header_count],
    });
    defer req.deinit();

    try req.sendBodyComplete(try allocator.dupe(u8, body));

    var response = try receiveHttpHead(&req);

    if (response.head.status != .created and response.head.status.class() != .success) {
        std.log.err("[cp] registry put failed status={} path={s}", .{ response.head.status, path });
        return error.ControlPlaneRequestFailed;
    }

    var discard_buffer: [1024]u8 = undefined;
    const body_reader = response.reader(&discard_buffer);
    _ = body_reader.discardRemaining() catch {};
}

fn getRegistryImageIo(
    allocator: std.mem.Allocator,
    io: std.Io,
    cp_url: []const u8,
    name: []const u8,
    tag: []const u8,
    api_key: ?[]const u8,
) ![]u8 {
    const path = try std.fmt.allocPrint(allocator, "{s}/cr/images/{s}/{s}", .{ cp_url, name, tag });
    defer allocator.free(path);

    const archive_path = try std.fmt.allocPrint(allocator, "/tmp/platform-cr-{s}-{s}.tar", .{ name, tag });
    defer allocator.free(archive_path);

    if (std.Io.Dir.cwd().access(io, archive_path, .{})) |_| {
        std.Io.Dir.cwd().deleteFile(io, archive_path) catch {};
    } else |_| {}

    const uri = try std.Uri.parse(path);
    var client = std.http.Client{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    var auth_value: ?[]const u8 = null;
    defer if (auth_value) |value| allocator.free(value);

    var headers_buf: [2]std.http.Header = undefined;
    var header_count: usize = 1;
    headers_buf[0] = .{ .name = "accept", .value = "application/octet-stream" };

    if (api_key) |token| {
        auth_value = try std.fmt.allocPrint(allocator, "Bearer {s}", .{token});
        headers_buf[1] = .{ .name = "authorization", .value = auth_value.? };
        header_count = 2;
    }

    var req = try client.request(.GET, uri, .{
        .extra_headers = headers_buf[0..header_count],
    });
    defer req.deinit();

    try req.sendBodiless();

    var response = try receiveHttpHead(&req);

    if (response.head.status.class() != .success) {
        std.log.err("[cp] registry get failed status={} path={s}", .{ response.head.status, path });
        return error.ControlPlaneRequestFailed;
    }

    try writeHttpBodyToFile(io, &response, archive_path);

    return try allocator.dupe(u8, archive_path);
}
