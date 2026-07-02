const std = @import("std");
const env_util = @import("env_util.zig");

/// Control plane client configuration loaded from environment variables.
pub const Config = struct {
    // Control plane base URL.
    cp_url: []const u8,

    // Node identifier registered with the control plane.
    node_id: []const u8,

    // Hostname reported during registration.
    hostname: []const u8,

    // Agent HTTP URL reachable by the control plane.
    agent_url: []const u8,

    // Agent version string reported during registration.
    agent_version: []const u8,
};

/// Loads agent control plane configuration from environment variables.
pub fn loadConfig(
    // The allocator to use.
    allocator: std.mem.Allocator,
) !Config {
    const cp_url = try env_util.readEnvOrDefault(allocator, "PLATFORM_CP_URL", "http://control-plane-1:8080");
    errdefer allocator.free(cp_url);

    const node_id = try env_util.readEnvOrDefault(allocator, "NODE_ID", "agent-1");
    errdefer allocator.free(node_id);

    const hostname = try env_util.readEnvOrDefault(allocator, "HOSTNAME", node_id);
    errdefer allocator.free(hostname);

    const agent_port = env_util.readEnvU16("AGENT_PORT", 9470);
    const agent_url_default = try std.fmt.allocPrint(allocator, "http://{s}:{d}", .{ hostname, agent_port });
    errdefer allocator.free(agent_url_default);

    const agent_url = try env_util.readEnvOrDefault(allocator, "AGENT_URL", agent_url_default);
    if (!std.mem.eql(u8, agent_url, agent_url_default)) {
        allocator.free(agent_url_default);
    }
    errdefer allocator.free(agent_url);

    const agent_version = try env_util.readEnvOrDefault(allocator, "AGENT_VERSION", "zig-0.1.0");
    errdefer allocator.free(agent_version);

    return .{
        .cp_url = cp_url,
        .node_id = node_id,
        .hostname = hostname,
        .agent_url = agent_url,
        .agent_version = agent_version,
    };
}

/// Starts background registration and heartbeat loop against the control plane.
pub fn startBackground(
    allocator: std.mem.Allocator,
    // Loaded control plane configuration.
    config: Config,
) !void {
    const heap_config = try allocator.create(Config);
    heap_config.* = config;

    const thread = try std.Thread.spawn(.{}, backgroundLoop, .{ allocator, heap_config });
    thread.detach();
}

fn backgroundLoop(allocator: std.mem.Allocator, config: *const Config) void {
    defer allocator.destroy(config);

    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

    while (true) {
        registerNode(allocator, config.*) catch |err| {
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
            sendHeartbeat(allocator, config.*) catch |err| {
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

fn registerNode(allocator: std.mem.Allocator, config: Config) !void {
    const body = try std.fmt.allocPrint(
        allocator,
        "{{\"id\":\"{s}\",\"hostname\":\"{s}\",\"agentVersion\":\"{s}\",\"agentUrl\":\"{s}\",\"labels\":{{\"role\":\"dogfood\"}},\"capabilities\":[\"docker\"],\"resources\":{{\"cpuMillisTotal\":4000,\"cpuMillisUsed\":0,\"memoryMbTotal\":8192,\"memoryMbUsed\":0,\"diskMbTotal\":102400,\"diskMbUsed\":0}}}}",
        .{ config.node_id, config.hostname, config.agent_version, config.agent_url },
    );
    defer allocator.free(body);

    const path = try std.fmt.allocPrint(allocator, "{s}/nodes/register", .{config.cp_url});
    defer allocator.free(path);

    try postJson(allocator, path, body);
    std.log.info("[cp] registered node id={s} url={s}", .{ config.node_id, config.agent_url });
}

fn sendHeartbeat(allocator: std.mem.Allocator, config: Config) !void {
    const body =
        "{\"status\":\"online\",\"resources\":{\"cpuMillisTotal\":4000,\"cpuMillisUsed\":500,\"memoryMbTotal\":8192,\"memoryMbUsed\":1024,\"diskMbTotal\":102400,\"diskMbUsed\":2048}}";

    const path = try std.fmt.allocPrint(
        allocator,
        "{s}/nodes/{s}/heartbeat",
        .{ config.cp_url, config.node_id },
    );
    defer allocator.free(path);

    try postJson(allocator, path, body);
}

fn reportInstanceStatus(
    allocator: std.mem.Allocator,
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

    postJson(allocator, path, body) catch |err| {
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
    reportInstanceStatus(allocator, config, instance_id, "running");
}

pub fn reportInstanceStopped(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Instance identifier to report.
    instance_id: []const u8,
) void {
    reportInstanceStatus(allocator, config, instance_id, "stopped");
}

pub fn reportInstanceFailed(
    allocator: std.mem.Allocator,
    // Control plane client configuration.
    config: Config,
    // Instance identifier to report.
    instance_id: []const u8,
) void {
    reportInstanceStatus(allocator, config, instance_id, "failed");
}

fn postJson(allocator: std.mem.Allocator, url: []const u8, body: []const u8) !void {
    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

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

    var redirect_buffer: [1024]u8 = undefined;
    const response = try req.receiveHead(&redirect_buffer);

    if (response.head.status.class() != .success and response.head.status != .created) {
        std.log.err("[cp] request failed status={} url={s}", .{ response.head.status, url });
        return error.ControlPlaneRequestFailed;
    }
}
