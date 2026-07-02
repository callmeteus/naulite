const std = @import("std");
const bootstrap = @import("bootstrap.zig");
const http_server = @import("http_server.zig");
const netbird = @import("netbird.zig");

pub fn main() !void {
    var safe_allocator: std.heap.SafeAllocator = .init(std.heap.page_allocator, .{});
    defer _ = safe_allocator.deinit();
    const allocator = safe_allocator.allocator();

    const os = bootstrap.detectOsFamily();
    std.log.info("[agent] starting os={s}", .{@tagName(os)});

    var netbird_client = try netbird.NetbirdClient.loadFromEnv(allocator);
    defer netbird_client.deinit();

    netbird_client.ensureConnected() catch |err| {
        std.log.warn("[netbird] ensure connected failed: {}", .{err});
    };

    const config = http_server.Config{
        .listen_address = "0.0.0.0",
        .listen_port = 9470,
        .docker_socket = defaultDockerSocket(os),
    };

    try http_server.serve(allocator, config);
}

fn defaultDockerSocket(os: bootstrap.OsFamily) []const u8 {
    return switch (os) {
        .windows => "//./pipe/docker_engine",
        else => "/var/run/docker.sock",
    };
}
