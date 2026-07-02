const std = @import("std");
const builtin = @import("builtin");

/// Host operating system family detected at runtime.
pub const OsFamily = enum {
    linux,
    windows,
    macos,
    unknown,
};

/// Bootstrap status reported to the control plane.
pub const BootstrapStatus = struct {
    // Detected operating system family.
    os: OsFamily,

    // Human-readable OS version string.
    os_version: []const u8,

    // CPU architecture name.
    arch: []const u8,

    // Whether the Docker socket is reachable.
    docker_available: bool,

    // Whether NetBird reports a connected mesh.
    netbird_connected: bool,

    // Agent build version string.
    agent_version: []const u8,
};

/// Detects the host operating system family.
pub fn detectOsFamily() OsFamily {
    return switch (builtin.os.tag) {
        .linux => .linux,
        .windows => .windows,
        .macos => .macos,
        else => .unknown,
    };
}

/// Collects bootstrap status for reporting to the control plane.
pub fn collectStatus(
    // The allocator to use.
    allocator: std.mem.Allocator,
) !BootstrapStatus {
    const os = detectOsFamily();
    const arch = @tagName(builtin.cpu.arch);

    const os_version = switch (os) {
        .linux => try allocator.dupe(u8, "linux-stub"),
        .windows => try allocator.dupe(u8, "windows-stub"),
        .macos => try allocator.dupe(u8, "macos-stub"),
        .unknown => try allocator.dupe(u8, "unknown"),
    };

    return .{
        .os = os,
        .os_version = os_version,
        .arch = arch,
        .docker_available = probeDockerSocket(),
        .netbird_connected = false,
        .agent_version = "0.1.0",
    };
}

/// Probes whether the Docker socket is reachable.
pub fn probeDockerSocket() bool {
    var threaded = std.Io.Threaded.init(std.heap.page_allocator, .{});
    defer threaded.deinit();
    const io = threaded.io();

    const socket_path = switch (detectOsFamily()) {
        .linux, .macos => "/var/run/docker.sock",
        .windows => "//./pipe/docker_engine",
        .unknown => return false,
    };

    const unix_address = std.Io.net.UnixAddress.init(socket_path) catch return false;
    const stream = unix_address.connect(io) catch return false;
    stream.close(io);
    return true;
}
