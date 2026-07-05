const std = @import("std");

const agent_config = @import("agent_config.zig");
const blocking_io = @import("blocking_io.zig");
const bootstrap = @import("bootstrap.zig");
const cp_client = @import("cp_client.zig");
const http_server = @import("http_server.zig");
const netbird = @import("netbird.zig");
const metrics_exporter = @import("runtime/docker/metrics_exporter.zig");

pub fn main(init: std.process.Init.Minimal) !void {
    const allocator = std.heap.smp_allocator;
    blocking_io.init(allocator, init.environ);
    const io = blocking_io.io();

    const os = bootstrap.detectOsFamily();
    std.log.info("[agent] starting os={s}", .{@tagName(os)});

    var agent_cfg = try cp_client.loadConfig(allocator, os);
    defer agent_cfg.deinit(allocator);

    agent_config.save(allocator, &agent_cfg) catch |err| {
        std.log.warn("[agent-config] bootstrap persist failed: {}", .{err});
    };

    ensureNetbirdConnected(allocator, &agent_cfg);

    try cp_client.startBackground(allocator, io, &agent_cfg);
    try metrics_exporter.startBackground(allocator, agent_cfg.node_id, agent_cfg.docker_socket);

    const server_config = http_server.Config{
        .listen_address = "0.0.0.0",
        .listen_port = agent_cfg.agent_port,
        .docker_socket = agent_cfg.docker_socket,
    };

    try http_server.serve(allocator, server_config);
}

/// Ensures the NetBird client is connected to the NetBird server.
fn ensureNetbirdConnected(
    /// The allocator to use.
    allocator: std.mem.Allocator,
    /// The agent configuration to use.
    agent_cfg: *agent_config.AgentConfig,
) void {
    if (netbird.NetbirdClient.loadFromAgentConfig(allocator, agent_cfg)) |client| {
        var netbird_client = client;
        defer netbird_client.deinit();

        netbird_client.ensureConnected() catch |err| {
            std.log.warn("[netbird] ensure connected failed: {}", .{err});
        };

        if (netbird_client.getDeviceId()) |device_id| {
            agent_config.setNetbirdDeviceId(allocator, agent_cfg, device_id) catch |err| {
                std.log.warn("[agent-config] netbird device id persist failed: {}", .{err});
            };
            agent_config.save(allocator, agent_cfg) catch |err| {
                std.log.warn("[agent-config] save netbird device id failed: {}", .{err});
            };
        }
    } else |err| {
        std.log.warn("[netbird] skipped: {}", .{err});
    }
}

test {
    _ = @import("build_context.zig");
    _ = @import("execution_plan.zig");
    _ = @import("http_server.zig");
    _ = @import("netbird.zig");
    _ = @import("process_cmd.zig");
    _ = @import("runtime/docker/docker_stats.zig");
    _ = @import("runtime/docker/metrics_exporter.zig");
}
