const logger = @import("logger");

const log_docker_stats = logger.Logger.create("docker-stats");

const std = @import("std");

const docker_api = @import("docker_api.zig");

/// Resource snapshot reported to the control plane during heartbeat.
pub const Snapshot = struct {
    // Total schedulable CPU capacity in millicores.
    cpu_millis_total: i64,

    // Estimated CPU usage in millicores across running containers.
    cpu_millis_used: i64,

    // Total host memory in megabytes.
    memory_mb_total: i64,

    // Memory used by running containers in megabytes.
    memory_mb_used: i64,

    // Total disk capacity in megabytes for Docker data.
    disk_mb_total: i64,

    // Disk used by Docker layers and volumes in megabytes.
    disk_mb_used: i64,
};

/// Returns a conservative fallback snapshot when Docker stats are unavailable.
pub fn fallbackSnapshot() Snapshot {
    return .{
        .cpu_millis_total = 1000,
        .cpu_millis_used = 0,
        .memory_mb_total = 1024,
        .memory_mb_used = 0,
        .disk_mb_total = 102_400,
        .disk_mb_used = 0,
    };
}

/// Reads container memory usage bytes from a Docker stats JSON payload.
pub fn readMemoryUsageBytesPublic(body: []const u8) i64 {
    return readMemoryUsageBytes(body);
}

/// Reads container CPU utilization percent from a Docker stats JSON payload.
pub fn readCpuPercentPublic(body: []const u8) f64 {
    return readCpuPercent(body);
}

/// Collects node resource telemetry from the Docker Engine API.
pub fn collect(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Path to the Docker socket.
    socket_path: []const u8,
) !Snapshot {
    const api = docker_api.DockerApi.init(allocator, socket_path);

    var info_response = try api.getInfo();
    defer info_response.deinit(allocator);

    const ncpu = try parseJsonIntField(allocator, info_response.body, "NCPU");
    const mem_total = try parseJsonIntField(allocator, info_response.body, "MemTotal");

    var disk_used_bytes: i64 = 0;
    var df_response = api.getSystemDf() catch null;
    if (df_response) |*response| {
        defer response.deinit(allocator);
        disk_used_bytes = parseJsonIntField(allocator, response.body, "LayersSize") catch 0;
        const volumes_size = parseJsonIntField(allocator, response.body, "VolumesSize") catch 0;
        disk_used_bytes += volumes_size;
    }

    var memory_used_bytes: i64 = 0;
    var cpu_percent_total: f64 = 0;

    const container_ids = try api.listRunningContainerIds();
    defer {
        for (container_ids) |container_id| {
            allocator.free(container_id);
        }
        allocator.free(container_ids);
    }

    for (container_ids) |container_id| {
        var stats_response = api.getContainerStats(container_id) catch continue;
        defer stats_response.deinit(allocator);

        memory_used_bytes += readMemoryUsageBytes(stats_response.body);
        cpu_percent_total += readCpuPercent(stats_response.body);
    }

    const cpu_millis_total = @max(ncpu, 1) * 1000;
    const cpu_millis_used = @as(i64, @intFromFloat(@min(cpu_percent_total, 100.0) * @as(f64, @floatFromInt(cpu_millis_total)) / 100.0));

    const memory_mb_total = @max(@divTrunc(mem_total, 1024 * 1024), 1);
    const memory_mb_used = @max(@divTrunc(memory_used_bytes, 1024 * 1024), 0);
    const disk_mb_used = @max(@divTrunc(disk_used_bytes, 1024 * 1024), 0);
    const disk_mb_total = @max(disk_mb_used * 4, 102_400);

    log_docker_stats.debug("cpu={d}/{d} mem={d}/{d} disk={d}/{d} containers={d}",
        .{ cpu_millis_used, cpu_millis_total, memory_mb_used, memory_mb_total, disk_mb_used, disk_mb_total, container_ids.len },
    );

    return .{
        .cpu_millis_total = cpu_millis_total,
        .cpu_millis_used = cpu_millis_used,
        .memory_mb_total = memory_mb_total,
        .memory_mb_used = memory_mb_used,
        .disk_mb_total = disk_mb_total,
        .disk_mb_used = disk_mb_used,
    };
}

fn readMemoryUsageBytes(body: []const u8) i64 {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return 0;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return 0;
    }

    const memory_stats = root.object.get("memory_stats") orelse return 0;
    if (memory_stats != .object) {
        return 0;
    }

    const usage = memory_stats.object.get("usage") orelse return 0;
    return switch (usage) {
        .integer => |value| value,
        .float => |value| @intFromFloat(value),
        else => 0,
    };
}

fn readCpuPercent(body: []const u8) f64 {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return 0;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return 0;
    }

    const cpu_stats = root.object.get("cpu_stats") orelse return 0;
    const precpu_stats = root.object.get("precpu_stats") orelse return 0;
    if (cpu_stats != .object or precpu_stats != .object) {
        return 0;
    }

    const cpu_usage = cpu_stats.object.get("cpu_usage") orelse return 0;
    const precpu_usage = precpu_stats.object.get("cpu_usage") orelse return 0;
    if (cpu_usage != .object or precpu_usage != .object) {
        return 0;
    }

    const total_usage = cpu_usage.object.get("total_usage") orelse return 0;
    const pre_total_usage = precpu_usage.object.get("total_usage") orelse return 0;
    const system_cpu_usage = cpu_stats.object.get("system_cpu_usage") orelse return 0;
    const pre_system_cpu_usage = precpu_stats.object.get("system_cpu_usage") orelse return 0;
    const online_cpus = cpu_stats.object.get("online_cpus") orelse return 0;

    const cpu_delta = jsonIntValue(total_usage) - jsonIntValue(pre_total_usage);
    const system_delta = jsonIntValue(system_cpu_usage) - jsonIntValue(pre_system_cpu_usage);
    const cpus = @max(jsonIntValue(online_cpus), 1);

    if (cpu_delta <= 0 or system_delta <= 0) {
        return 0;
    }

    return (@as(f64, @floatFromInt(cpu_delta)) / @as(f64, @floatFromInt(system_delta))) * @as(f64, @floatFromInt(cpus)) * 100.0;
}

fn jsonIntValue(value: std.json.Value) i64 {
    return switch (value) {
        .integer => |n| n,
        .float => |n| @intFromFloat(n),
        else => 0,
    };
}

fn parseJsonIntField(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // JSON response body.
    body: []const u8,
    // Field name to read.
    field_name: []const u8,
) !i64 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidDockerResponse;
    }

    const value = root.object.get(field_name) orelse return error.InvalidDockerResponse;
    return switch (value) {
        .integer => |n| n,
        .float => |n| @intFromFloat(n),
        else => error.InvalidDockerResponse,
    };
}

test "readCpuPercent returns zero for invalid payload" {
    try std.testing.expectEqual(@as(f64, 0), readCpuPercent("{}"));
}

test "readMemoryUsageBytes parses usage field" {
    const payload =
        \\{"memory_stats":{"usage":1048576}}
    ;
    try std.testing.expectEqual(@as(i64, 1048576), readMemoryUsageBytes(payload));
}
