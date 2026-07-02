const std = @import("std");

const agent_config = @import("agent_config.zig");
const bootstrap = @import("bootstrap.zig");

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
    const body = try std.fmt.allocPrint(
        allocator,
        "{{\"id\":\"{s}\",\"hostname\":\"{s}\",\"agentVersion\":\"{s}\",\"agentUrl\":\"{s}\",\"labels\":{{\"role\":\"dogfood\"}},\"capabilities\":[\"docker\"],\"resources\":{{\"cpuMillisTotal\":4000,\"cpuMillisUsed\":0,\"memoryMbTotal\":8192,\"memoryMbUsed\":0,\"diskMbTotal\":102400,\"diskMbUsed\":0}}}}",
        .{ config.node_id, config.hostname, config.agent_version, config.agent_url },
    );
    defer allocator.free(body);

    const path = try std.fmt.allocPrint(allocator, "{s}/nodes/register", .{config.cp_url});
    defer allocator.free(path);

    const response_body = try postJson(allocator, io, path, body);
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
    const body =
        "{\"status\":\"online\",\"resources\":{\"cpuMillisTotal\":4000,\"cpuMillisUsed\":500,\"memoryMbTotal\":8192,\"memoryMbUsed\":1024,\"diskMbTotal\":102400,\"diskMbUsed\":2048}}";

    const path = try std.fmt.allocPrint(
        allocator,
        "{s}/nodes/{s}/heartbeat",
        .{ config.cp_url, config.node_id },
    );
    defer allocator.free(path);

    const response_body = try postJson(allocator, io, path, body);
    defer allocator.free(response_body);
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

    const body = std.fmt.allocPrint(
        allocator,
        "{{\"status\":\"{s}\"}}",
        .{status},
    ) catch {
        return;
    };
    defer allocator.free(body);

    postJson(allocator, io, path, body) catch |err| {
        std.log.warn("[cp] instance status report failed id={s} status={s} err={}", .{ instance_id, status, err });
    };
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

fn postJson(
    allocator: std.mem.Allocator,
    io: std.Io,
    // Full request URL.
    url: []const u8,
    // JSON request body.
    body: []const u8,
) ![]u8 {
    const uri = try std.Uri.parse(url);
    var client = std.http.Client{
        .allocator = allocator,
        .io = io,
    };
    defer client.deinit();

    var req = try client.request(.POST, uri, .{
        .extra_headers = &.{
            .{ .name = "accept", .value = "application/json" },
            .{ .name = "content-type", .value = "application/json" },
        },
    });
    defer req.deinit();

    try req.sendBodyComplete(try allocator.dupe(u8, body));

    const response_buffer = try allocator.alloc(u8, 1024 * 1024);
    defer allocator.free(response_buffer);

    var response_writer = std.Io.Writer.fixed(response_buffer);
    const response = try req.receiveResponse(&response_writer);

    if (response.head.status.class() != .success and response.head.status != .created) {
        std.log.err("[cp] request failed status={} url={s}", .{ response.head.status, url });
        return error.ControlPlaneRequestFailed;
    }

    return try allocator.dupe(u8, response_writer.buffered());
}
