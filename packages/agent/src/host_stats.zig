const logger = @import("logger");

const log_host_stats = logger.Logger.create("host-stats");

const std = @import("std");
const builtin = @import("builtin");

const blocking_io = @import("blocking_io.zig");
const docker_stats = @import("runtime/docker/docker_stats.zig");
const env_util = @import("env_util.zig");

const default_meminfo_paths = [_][]const u8{
    "/host/proc/meminfo",
    "/proc/meminfo",
};

const default_loadavg_paths = [_][]const u8{
    "/host/proc/loadavg",
    "/proc/loadavg",
};

/// Collects host resource telemetry from the Linux kernel when Docker stats are unavailable.
pub fn collect(allocator: std.mem.Allocator) !docker_stats.Snapshot {
    if (builtin.os.tag != .linux) {
        return error.UnsupportedHostStatsPlatform;
    }

    const meminfo = try readMeminfoContent(allocator);
    defer allocator.free(meminfo);

    const mem_total_kb = try parseProcMeminfoKb("MemTotal", meminfo);
    const mem_available_kb = parseProcMeminfoKb("MemAvailable", meminfo) catch mem_total_kb;

    const memory_mb_total = @max(@divTrunc(mem_total_kb, 1024), 1);
    const memory_mb_used = @max(
        @divTrunc(mem_total_kb - mem_available_kb, 1024),
        0,
    );

    const ncpu: i64 = @intCast(std.Thread.getCpuCount() catch 1);
    const cpu_millis_total = @max(ncpu, 1) * 1000;

    const loadavg = readLoadavgContent(allocator) catch |err| {
        log_host_stats.debug("loadavg unavailable err={}", .{err});
        return .{
            .cpu_millis_total = cpu_millis_total,
            .cpu_millis_used = 0,
            .memory_mb_total = memory_mb_total,
            .memory_mb_used = memory_mb_used,
            .disk_mb_total = 102_400,
            .disk_mb_used = 0,
        };
    };
    defer allocator.free(loadavg);

    const load1 = parseLoadAverage1(loadavg) catch 0;
    const load_ratio = @min(load1 / @as(f64, @floatFromInt(@max(ncpu, 1))), 1.0);
    const cpu_millis_used = @as(i64, @intFromFloat(load_ratio * @as(f64, @floatFromInt(cpu_millis_total))));

    log_host_stats.debug(
        "cpu={d}/{d} mem={d}/{d} load1={}",
        .{ cpu_millis_used, cpu_millis_total, memory_mb_used, memory_mb_total, load1 },
    );

    return .{
        .cpu_millis_total = cpu_millis_total,
        .cpu_millis_used = cpu_millis_used,
        .memory_mb_total = memory_mb_total,
        .memory_mb_used = memory_mb_used,
        .disk_mb_total = 102_400,
        .disk_mb_used = 0,
    };
}

/// Reads host meminfo from env override or default mount paths.
fn readMeminfoContent(allocator: std.mem.Allocator) ![]u8 {
    if (env_util.readEnvOptional(allocator, "NAULITE_HOST_MEMINFO")) |custom_path| {
        defer allocator.free(custom_path);
        return readFileLimited(allocator, custom_path, 32 * 1024);
    }

    return readFirstExistingFile(allocator, default_meminfo_paths[0..], 32 * 1024);
}

/// Reads host loadavg from env override or default mount paths.
fn readLoadavgContent(allocator: std.mem.Allocator) ![]u8 {
    if (env_util.readEnvOptional(allocator, "NAULITE_HOST_LOADAVG")) |custom_path| {
        defer allocator.free(custom_path);
        return readFileLimited(allocator, custom_path, 256);
    }

    return readFirstExistingFile(allocator, default_loadavg_paths[0..], 256);
}

/// Reads the first existing file from a list of candidate paths.
fn readFirstExistingFile(
    allocator: std.mem.Allocator,
    paths: []const []const u8,
    max_bytes: usize,
) ![]u8 {
    for (paths) |file_path| {
        const content = readFileLimited(allocator, file_path, max_bytes) catch continue;
        return content;
    }

    return error.HostProcFileUnavailable;
}

/// Reads a file up to a byte limit.
fn readFileLimited(allocator: std.mem.Allocator, file_path: []const u8, max_bytes: usize) ![]u8 {
    const io = blocking_io.io();
    return std.Io.Dir.cwd().readFileAlloc(io, file_path, allocator, .limited(max_bytes));
}

/// Parses a kilobyte counter from a meminfo blob.
fn parseProcMeminfoKb(field: []const u8, content: []const u8) !i64 {
    var lines = std.mem.splitScalar(u8, content, '\n');

    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (!std.mem.startsWith(u8, trimmed, field)) {
            continue;
        }

        if (trimmed.len <= field.len or trimmed[field.len] != ':') {
            continue;
        }

        var parts = std.mem.splitScalar(u8, trimmed[field.len + 1 ..], ' ');
        while (parts.next()) |part| {
            const token = std.mem.trim(u8, part, " \t");
            if (token.len == 0) {
                continue;
            }

            return std.fmt.parseInt(i64, token, 10);
        }
    }

    return error.HostMeminfoFieldMissing;
}

/// Parses the 1-minute load average from a loadavg blob.
fn parseLoadAverage1(content: []const u8) !f64 {
    const slice = std.mem.trim(u8, content, " \t\r\n");
    var parts = std.mem.splitScalar(u8, slice, ' ');
    const first = parts.next() orelse return error.HostLoadavgUnavailable;

    return std.fmt.parseFloat(f64, first);
}

test "parseProcMeminfoKb reads MemTotal and MemAvailable" {
    const content =
        \\MemTotal:       16384000 kB
        \\MemAvailable:    8192000 kB
    ;

    try std.testing.expectEqual(@as(i64, 16384000), try parseProcMeminfoKb("MemTotal", content));
    try std.testing.expectEqual(@as(i64, 8192000), try parseProcMeminfoKb("MemAvailable", content));
}

test "parseLoadAverage1 reads first field" {
    try std.testing.expectApproxEqAbs(@as(f64, 1.25), try parseLoadAverage1("1.25 0.98 0.75 2/512 99999"), 0.001);
}
