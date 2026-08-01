const logger = @import("logger");

const log_bootstrap = logger.Logger.create("bootstrap");

const std = @import("std");
const builtin = @import("builtin");

const netbird = @import("netbird.zig");
const process_cmd = @import("process_cmd.zig");
const blocking_io = @import("blocking_io.zig");

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

/// Detects a human-readable operating system version string.
pub fn detectOsVersion(allocator: std.mem.Allocator) ![]u8 {
    const os = detectOsFamily();
    return switch (os) {
        .linux => detectLinuxOsVersion(allocator),
        .windows => detectWindowsOsVersion(allocator),
        .macos => detectMacOsVersion(allocator),
        .unknown => try allocator.dupe(u8, "unknown"),
    };
}

/// Collects bootstrap status for reporting to the control plane.
pub fn collectStatus(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Optional NetBird client used to report mesh connectivity.
    netbird_client: ?*netbird.NetbirdClient,
) !BootstrapStatus {
    const os = detectOsFamily();
    const arch = @tagName(builtin.cpu.arch);

    const os_version = detectOsVersion(allocator) catch |err| blk: {
        log_bootstrap.debug("os version detection failed os={s} err={}", .{ @tagName(os), err });
        break :blk try allocator.dupe(u8, switch (os) {
            .linux => "linux",
            .windows => "windows",
            .macos => "macos",
            .unknown => "unknown",
        });
    };
    log_bootstrap.debug("detected os={s} os_version={s}", .{ @tagName(os), os_version });

    const netbird_connected = if (netbird_client) |client| client.isConnected() else false;

    return .{
        .os = os,
        .os_version = os_version,
        .arch = arch,
        .docker_available = probeDockerSocket(),
        .netbird_connected = netbird_connected,
        .agent_version = "0.1.0",
    };
}

/// Probes whether the Docker socket is reachable.
pub fn probeDockerSocket() bool {
    const io = blocking_io.io();

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

/// Detects a human-readable Linux OS version string.
fn detectLinuxOsVersion(
    // The allocator to use.
    allocator: std.mem.Allocator,
) ![]u8 {
    const io = blocking_io.io();
    const content = std.Io.Dir.cwd().readFileAlloc(io, "/etc/os-release", allocator, .limited(64 * 1024)) catch {
        return try allocator.dupe(u8, "linux");
    };
    defer allocator.free(content);

    if (parseOsReleaseValue(content, "PRETTY_NAME")) |pretty| {
        return try allocator.dupe(u8, pretty);
    }

    if (parseOsReleaseValue(content, "VERSION_ID")) |version_id| {
        return try allocator.dupe(u8, version_id);
    }

    return try allocator.dupe(u8, "linux");
}

/// Detects a human-readable Windows OS version string.
fn detectWindowsOsVersion(
    // The allocator to use.
    allocator: std.mem.Allocator,
) ![]u8 {
    if (builtin.os.tag != .windows) {
        return try allocator.dupe(u8, "windows");
    }

    const windows = std.os.windows;
    const ntdll = std.os.windows.ntdll;

    var version_info: windows.RTL_OSVERSIONINFOW = undefined;
    version_info.dwOSVersionInfoSize = @sizeOf(windows.RTL_OSVERSIONINFOW);

    const status = ntdll.RtlGetVersion(&version_info);
    if (status != .SUCCESS) {
        return try allocator.dupe(u8, "windows");
    }

    return try formatWindowsOsVersion(
        allocator,
        version_info.dwMajorVersion,
        version_info.dwMinorVersion,
        version_info.dwBuildNumber,
    );
}

/// Formats a Windows version triple into a stable ASCII product string.
fn formatWindowsOsVersion(
    allocator: std.mem.Allocator,
    major: u32,
    minor: u32,
    build: u32,
) ![]u8 {
    const product_name = if (major == 10 and build >= 22000)
        "Microsoft Windows 11"
    else if (major == 10)
        "Microsoft Windows 10"
    else
        "Microsoft Windows";

    return std.fmt.allocPrint(allocator, "{s} {d}.{d}.{d}", .{ product_name, major, minor, build });
}

/// Detects a human-readable macOS OS version string.
fn detectMacOsVersion(
    // The allocator to use.
    allocator: std.mem.Allocator,
) ![]u8 {
    const output = runCommand(allocator, &.{ "sw_vers", "-productVersion" }) catch {
        return try allocator.dupe(u8, "macos");
    };
    defer allocator.free(output);

    const trimmed = std.mem.trim(u8, output, " \t\r\n");
    if (trimmed.len == 0) {
        return try allocator.dupe(u8, "macos");
    }

    return try allocator.dupe(u8, trimmed);
}

/// Parses a value from an OS release file.
fn parseOsReleaseValue(
    // The content of the OS release file.
    content: []const u8,
    // The key to parse.
    key: []const u8,
) ?[]const u8 {
    var lines = std.mem.splitScalar(u8, content, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0 or trimmed[0] == '#') {
            continue;
        }

        const eq = std.mem.indexOfScalar(u8, trimmed, '=') orelse continue;
        const line_key = trimmed[0..eq];
        if (!std.mem.eql(u8, line_key, key)) {
            continue;
        }

        var value = trimmed[eq + 1 ..];
        if (value.len >= 2 and value[0] == '"' and value[value.len - 1] == '"') {
            value = value[1 .. value.len - 1];
        }

        return value;
    }

    return null;
}

/// Runs a command and returns the output.
fn runCommand(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // The command to run.
    argv: []const []const u8,
) ![]u8 {
    return process_cmd.runCommand(allocator, argv);
}

test "detectOsFamily matches compile-time target" {
    const os = detectOsFamily();
    const expected = switch (builtin.os.tag) {
        .linux => OsFamily.linux,
        .windows => OsFamily.windows,
        .macos => OsFamily.macos,
        else => OsFamily.unknown,
    };
    try std.testing.expectEqual(expected, os);
}

test "parseOsReleaseValue prefers PRETTY_NAME" {
    const content =
        \\NAME="Ubuntu"
        \\VERSION="22.04.3 LTS (Jammy Jellyfish)"
        \\ID=ubuntu
        \\PRETTY_NAME="Ubuntu 22.04.3 LTS"
        \\VERSION_ID="22.04"
    ;

    const pretty = parseOsReleaseValue(content, "PRETTY_NAME").?;
    try std.testing.expectEqualStrings("Ubuntu 22.04.3 LTS", pretty);

    const version_id = parseOsReleaseValue(content, "VERSION_ID").?;
    try std.testing.expectEqualStrings("22.04", version_id);
}

test "parseOsReleaseValue returns null for missing key" {
    const content =
        \\NAME="Alpine"
        \\ID=alpine
    ;

    try std.testing.expect(parseOsReleaseValue(content, "PRETTY_NAME") == null);
}

test "formatWindowsOsVersion uses ascii product name" {
    const allocator = std.testing.allocator;

    const win10 = try formatWindowsOsVersion(allocator, 10, 0, 19045);
    defer allocator.free(win10);
    try std.testing.expectEqualStrings("Microsoft Windows 10 10.0.19045", win10);

    const win11 = try formatWindowsOsVersion(allocator, 10, 0, 22631);
    defer allocator.free(win11);
    try std.testing.expectEqualStrings("Microsoft Windows 11 10.0.22631", win11);
}

test "detectOsVersion returns non-empty string" {
    const allocator = std.testing.allocator;
    const version = try detectOsVersion(allocator);
    defer allocator.free(version);
    try std.testing.expect(version.len > 0);
}
