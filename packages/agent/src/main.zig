const std = @import("std");
const agent_config = @import("agent_config.zig");
const bootstrap = @import("bootstrap.zig");
const cp_client = @import("cp_client.zig");
const http_server = @import("http_server.zig");
const netbird = @import("netbird.zig");

pub fn main() !void {
    var safe_allocator: std.heap.SafeAllocator = .init(std.heap.page_allocator, .{});
    defer _ = safe_allocator.deinit();
    const allocator = safe_allocator.allocator();

    var threaded = std.Io.Threaded.init(allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

    const os = bootstrap.detectOsFamily();
    std.log.info("[agent] starting os={s}", .{@tagName(os)});

    var agent_cfg = try cp_client.loadConfig(allocator, io, os);
    defer agent_cfg.deinit(allocator);

    agent_config.save(allocator, io, &agent_cfg) catch |err| {
        std.log.warn("[agent-config] bootstrap persist failed: {}", .{err});
    };

    if (netbird.NetbirdClient.loadFromAgentConfig(allocator, &agent_cfg)) |client| {
        var netbird_client = client;
        defer netbird_client.deinit();

        netbird_client.ensureConnected() catch |err| {
            std.log.warn("[netbird] ensure connected failed: {}", .{err});
        };

        if (netbird_client.getDeviceId()) |device_id| {
            agent_config.setNetbirdDeviceId(allocator, &agent_cfg, device_id) catch |err| {
                std.log.warn("[agent-config] netbird device id persist failed: {}", .{err});
            };
        }
    } else |err| {
        std.log.warn("[netbird] skipped: {}", .{err});
    }

    try cp_client.startBackground(allocator, io, &agent_cfg);

    const server_config = http_server.Config{
        .listen_address = "0.0.0.0",
        .listen_port = agent_cfg.agent_port,
        .docker_socket = agent_cfg.docker_socket,
    };

    try http_server.serve(allocator, server_config);
}

test {
    _ = @import("build_context.zig");
    _ = @import("execution_plan.zig");
    _ = @import("http_server.zig");
    _ = @import("netbird.zig");
    _ = @import("runtime/docker_stats.zig");
}
