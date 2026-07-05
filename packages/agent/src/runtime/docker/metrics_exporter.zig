const std = @import("std");

const blocking_io = @import("../../blocking_io.zig");
const env_util = @import("../../env_util.zig");
const docker_api = @import("docker_api.zig");
const docker_stats = @import("docker_stats.zig");

/// Per-instance telemetry collected from Docker container stats.
pub const InstanceMetric = struct {
    instance_id: []const u8,
    service_name: []const u8,
    cpu_percent: f64,
    memory_bytes: i64,
    network_rx_bytes: i64,
    network_tx_bytes: i64,
};

/// Cached Prometheus snapshot served by GET /metrics.
pub const Snapshot = struct {
    node_id: []const u8,
    node_resources: docker_stats.Snapshot,
    instances: []InstanceMetric,
};

const SharedState = struct {
    mutex: std.Io.Mutex = .init,
    snapshot: ?Snapshot = null,
};

var shared_state: SharedState = .{};

/// Starts the background metrics collector loop.
///
/// @param allocator Allocator for collection buffers
/// @param node_id Node identifier label for exported metrics
/// @param docker_socket Path to the Docker Unix socket or named pipe
pub fn startBackground(
    allocator: std.mem.Allocator,
    node_id: []const u8,
    docker_socket: []const u8,
) !void {
    const owned_node_id = try allocator.dupe(u8, node_id);
    const owned_socket = try allocator.dupe(u8, docker_socket);

    const thread = try std.Thread.spawn(.{}, backgroundLoop, .{ allocator, owned_node_id, owned_socket });
    thread.detach();
}

/// Returns the latest cached snapshot, if any collection has completed.
///
/// @param allocator Allocator used to duplicate returned strings
/// @returns Cached snapshot or null when not yet collected
pub fn latestSnapshot(allocator: std.mem.Allocator) ?Snapshot {
    shared_state.mutex.lock(blocking_io.io()) catch {};
    defer shared_state.mutex.unlock(blocking_io.io());

    const cached = shared_state.snapshot orelse return null;
    return duplicateSnapshot(allocator, cached) catch return null;
}

/// Formats the latest snapshot as Prometheus text exposition.
///
/// @param allocator Allocator for the output buffer
/// @returns Prometheus metrics document
pub fn formatPrometheusText(allocator: std.mem.Allocator) ![]u8 {
    shared_state.mutex.lock(blocking_io.io()) catch {};
    defer shared_state.mutex.unlock(blocking_io.io());

    const snapshot = shared_state.snapshot orelse {
        return try std.fmt.allocPrint(
            allocator,
            "# HELP naulite_agent_up Agent process is running.\n# TYPE naulite_agent_up gauge\nnaulite_agent_up 1\n",
            .{},
        );
    };

    return try renderPrometheus(allocator, snapshot);
}

fn backgroundLoop(
    allocator: std.mem.Allocator,
    node_id: []const u8,
    docker_socket: []const u8,
) void {
    defer allocator.free(node_id);
    defer allocator.free(docker_socket);

    const interval_secs = env_util.readEnvU16("NAULITE_METRICS_INTERVAL_SECS", 15);

    while (true) {
        collectOnce(allocator, node_id, docker_socket) catch |err| {
            std.log.warn("[metrics] collect failed: {}", .{err});
        };
        blocking_io.sleepSeconds(interval_secs);
    }
}

/// Collects node and instance metrics once and updates the shared snapshot.
///
/// @param allocator Allocator for collection buffers
/// @param node_id Node identifier label
/// @param docker_socket Docker socket path
fn collectOnce(
    allocator: std.mem.Allocator,
    node_id: []const u8,
    docker_socket: []const u8,
) !void {
    const node_resources = docker_stats.collect(allocator, docker_socket) catch docker_stats.fallbackSnapshot();

    const api = docker_api.DockerApi.init(allocator, docker_socket);
    const containers = api.listManagedContainers() catch |err| {
        std.log.debug("[metrics] managed container list unavailable err={}", .{err});
        const empty_instances = try allocator.alloc(InstanceMetric, 0);
        const snapshot = Snapshot{
            .node_id = try allocator.dupe(u8, node_id),
            .node_resources = node_resources,
            .instances = empty_instances,
        };

        shared_state.mutex.lock(blocking_io.io()) catch {};
        defer shared_state.mutex.unlock(blocking_io.io());

        if (shared_state.snapshot) |*previous| {
            freeSnapshot(allocator, previous);
        }

        shared_state.snapshot = snapshot;
        return;
    };

    defer {
        for (containers) |container| {
            allocator.free(container.instance_id);
            allocator.free(container.service_name);
        }
        allocator.free(containers);
    }

    var instances = try allocator.alloc(InstanceMetric, containers.len);
    errdefer allocator.free(instances);

    var instance_count: usize = 0;
    for (containers) |container| {
        var stats_response = api.getContainerStats(container.docker_id) catch continue;
        defer stats_response.deinit(allocator);

        const network = readNetworkBytes(stats_response.body);
        instances[instance_count] = .{
            .instance_id = try allocator.dupe(u8, container.instance_id),
            .service_name = try allocator.dupe(u8, container.service_name),
            .cpu_percent = docker_stats.readCpuPercentPublic(stats_response.body),
            .memory_bytes = docker_stats.readMemoryUsageBytesPublic(stats_response.body),
            .network_rx_bytes = network.rx_bytes,
            .network_tx_bytes = network.tx_bytes,
        };
        instance_count += 1;
    }

    const snapshot = Snapshot{
        .node_id = try allocator.dupe(u8, node_id),
        .node_resources = node_resources,
        .instances = instances[0..instance_count],
    };

    shared_state.mutex.lock(blocking_io.io()) catch {};
    defer shared_state.mutex.unlock(blocking_io.io());

    if (shared_state.snapshot) |*previous| {
        freeSnapshot(allocator, previous);
    }

    shared_state.snapshot = snapshot;

    std.log.debug(
        "[metrics] collect nodeId={s} instances={d} cpu={d}/{d} mem={d}/{d}",
        .{
            node_id,
            instance_count,
            node_resources.cpu_millis_used,
            node_resources.cpu_millis_total,
            node_resources.memory_mb_used,
            node_resources.memory_mb_total,
        },
    );
}

fn duplicateSnapshot(allocator: std.mem.Allocator, snapshot: Snapshot) !Snapshot {
    const instances = try allocator.alloc(InstanceMetric, snapshot.instances.len);
    for (snapshot.instances, 0..) |instance, index| {
        instances[index] = .{
            .instance_id = try allocator.dupe(u8, instance.instance_id),
            .service_name = try allocator.dupe(u8, instance.service_name),
            .cpu_percent = instance.cpu_percent,
            .memory_bytes = instance.memory_bytes,
            .network_rx_bytes = instance.network_rx_bytes,
            .network_tx_bytes = instance.network_tx_bytes,
        };
    }

    return .{
        .node_id = try allocator.dupe(u8, snapshot.node_id),
        .node_resources = snapshot.node_resources,
        .instances = instances,
    };
}

fn freeSnapshot(allocator: std.mem.Allocator, snapshot: *Snapshot) void {
    allocator.free(snapshot.node_id);
    for (snapshot.instances) |instance| {
        allocator.free(instance.instance_id);
        allocator.free(instance.service_name);
    }
    allocator.free(snapshot.instances);
    snapshot.* = undefined;
}

const NetworkBytes = struct {
    rx_bytes: i64,
    tx_bytes: i64,
};

fn readNetworkBytes(body: []const u8) NetworkBytes {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch {
        return .{ .rx_bytes = 0, .tx_bytes = 0 };
    };
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return .{ .rx_bytes = 0, .tx_bytes = 0 };
    }

    const networks = root.object.get("networks") orelse return .{ .rx_bytes = 0, .tx_bytes = 0 };
    if (networks != .object) {
        return .{ .rx_bytes = 0, .tx_bytes = 0 };
    }

    var rx_total: i64 = 0;
    var tx_total: i64 = 0;

    var iterator = networks.object.iterator();
    while (iterator.next()) |entry| {
        if (entry.value_ptr.* != .object) {
            continue;
        }

        if (entry.value_ptr.object.get("rx_bytes")) |rx_value| {
            rx_total += jsonIntValue(rx_value);
        }
        if (entry.value_ptr.object.get("tx_bytes")) |tx_value| {
            tx_total += jsonIntValue(tx_value);
        }
    }

    return .{ .rx_bytes = rx_total, .tx_bytes = tx_total };
}

fn jsonIntValue(value: std.json.Value) i64 {
    return switch (value) {
        .integer => |n| n,
        .float => |n| @intFromFloat(n),
        else => 0,
    };
}

fn renderPrometheus(allocator: std.mem.Allocator, snapshot: Snapshot) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(allocator);

    const node_label = try escapeLabelValue(allocator, snapshot.node_id);
    defer allocator.free(node_label);

    try appendMetricHeader(&output, allocator, "naulite_agent_up", "gauge", "Agent process is running.");
    try appendLine(&output, allocator, "naulite_agent_up{{node_id=\"{s}\"}} 1\n", .{node_label});

    try appendMetricHeader(&output, allocator, "naulite_node_cpu_millis_total", "gauge", "Total schedulable CPU capacity in millicores.");
    try appendLine(&output, allocator, "naulite_node_cpu_millis_total{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.cpu_millis_total });

    try appendMetricHeader(&output, allocator, "naulite_node_cpu_millis_used", "gauge", "Estimated CPU usage in millicores.");
    try appendLine(&output, allocator, "naulite_node_cpu_millis_used{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.cpu_millis_used });

    try appendMetricHeader(&output, allocator, "naulite_node_memory_mb_total", "gauge", "Total host memory in megabytes.");
    try appendLine(&output, allocator, "naulite_node_memory_mb_total{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.memory_mb_total });

    try appendMetricHeader(&output, allocator, "naulite_node_memory_mb_used", "gauge", "Memory used by running containers in megabytes.");
    try appendLine(&output, allocator, "naulite_node_memory_mb_used{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.memory_mb_used });

    try appendMetricHeader(&output, allocator, "naulite_node_disk_mb_total", "gauge", "Total disk capacity in megabytes for Docker data.");
    try appendLine(&output, allocator, "naulite_node_disk_mb_total{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.disk_mb_total });

    try appendMetricHeader(&output, allocator, "naulite_node_disk_mb_used", "gauge", "Disk used by Docker layers and volumes in megabytes.");
    try appendLine(&output, allocator, "naulite_node_disk_mb_used{{node_id=\"{s}\"}} {d}\n", .{ node_label, snapshot.node_resources.disk_mb_used });

    try appendMetricHeader(&output, allocator, "naulite_instance_cpu_percent", "gauge", "Container CPU utilization percent.");
    try appendMetricHeader(&output, allocator, "naulite_instance_memory_bytes", "gauge", "Container memory usage in bytes.");
    try appendMetricHeader(&output, allocator, "naulite_instance_network_rx_bytes", "counter", "Container network receive bytes.");
    try appendMetricHeader(&output, allocator, "naulite_instance_network_tx_bytes", "counter", "Container network transmit bytes.");

    for (snapshot.instances) |instance| {
        const instance_label = try escapeLabelValue(allocator, instance.instance_id);
        defer allocator.free(instance_label);
        const service_label = try escapeLabelValue(allocator, instance.service_name);
        defer allocator.free(service_label);

        try appendLine(&output, allocator, "naulite_instance_cpu_percent{{node_id=\"{s}\",instance_id=\"{s}\",service_name=\"{s}\"}} {d:.4}\n", .{
            node_label,
            instance_label,
            service_label,
            instance.cpu_percent,
        });
        try appendLine(&output, allocator, "naulite_instance_memory_bytes{{node_id=\"{s}\",instance_id=\"{s}\",service_name=\"{s}\"}} {d}\n", .{
            node_label,
            instance_label,
            service_label,
            instance.memory_bytes,
        });
        try appendLine(&output, allocator, "naulite_instance_network_rx_bytes{{node_id=\"{s}\",instance_id=\"{s}\",service_name=\"{s}\"}} {d}\n", .{
            node_label,
            instance_label,
            service_label,
            instance.network_rx_bytes,
        });
        try appendLine(&output, allocator, "naulite_instance_network_tx_bytes{{node_id=\"{s}\",instance_id=\"{s}\",service_name=\"{s}\"}} {d}\n", .{
            node_label,
            instance_label,
            service_label,
            instance.network_tx_bytes,
        });
    }

    return try output.toOwnedSlice(allocator);
}

fn appendMetricHeader(
    output: *std.ArrayList(u8),
    allocator: std.mem.Allocator,
    name: []const u8,
    metric_type: []const u8,
    help: []const u8,
) !void {
    try appendLine(output, allocator, "# HELP {s} {s}\n# TYPE {s} {s}\n", .{ name, help, name, metric_type });
}

fn appendLine(output: *std.ArrayList(u8), allocator: std.mem.Allocator, comptime fmt: []const u8, args: anytype) !void {
    const line = try std.fmt.allocPrint(allocator, fmt, args);
    defer allocator.free(line);
    try output.appendSlice(allocator, line);
}

/// Escapes a label value for Prometheus text format.
///
/// @param allocator Allocator for the escaped string
/// @param value Raw label value
/// @returns Escaped label value
fn escapeLabelValue(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(allocator);

    for (value) |byte| {
        switch (byte) {
            '\\' => try output.appendSlice(allocator, "\\\\"),
            '\n' => try output.appendSlice(allocator, "\\n"),
            '"' => try output.appendSlice(allocator, "\\\""),
            else => try output.append(allocator, byte),
        }
    }

    return try output.toOwnedSlice(allocator);
}

test "escapeLabelValue escapes quotes and backslashes" {
    const allocator = std.testing.allocator;
    const escaped = try escapeLabelValue(allocator, "a\"b\\c");
    defer allocator.free(escaped);
    try std.testing.expectEqualStrings("a\\\"b\\\\c", escaped);
}

test "renderPrometheus includes node and instance metrics" {
    const allocator = std.testing.allocator;

    var instances = [_]InstanceMetric{
        .{
            .instance_id = "demo-api-1",
            .service_name = "api",
            .cpu_percent = 12.5,
            .memory_bytes = 1048576,
            .network_rx_bytes = 100,
            .network_tx_bytes = 200,
        },
    };

    const snapshot = Snapshot{
        .node_id = "node-1",
        .node_resources = .{
            .cpu_millis_total = 4000,
            .cpu_millis_used = 500,
            .memory_mb_total = 8192,
            .memory_mb_used = 1024,
            .disk_mb_total = 102400,
            .disk_mb_used = 2048,
        },
        .instances = instances[0..],
    };

    const text = try renderPrometheus(allocator, snapshot);
    defer allocator.free(text);

    try std.testing.expect(std.mem.indexOf(u8, text, "naulite_node_cpu_millis_total{node_id=\"node-1\"} 4000") != null);
    try std.testing.expect(std.mem.indexOf(u8, text, "naulite_instance_cpu_percent{node_id=\"node-1\",instance_id=\"demo-api-1\",service_name=\"api\"}") != null);
}
