const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const i18n = @import("i18n.zig");
const io_output = @import("io_output.zig");

/// Writes JSON to stdout with a trailing newline.
pub fn printJson(
    stdout: anytype,
    // JSON body to print.
    body: []const u8,
) !void {
    try stdout.print("{s}\n", .{body});
}

/// Lists cluster nodes.
pub fn getNodes(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/nodes");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Returns host package inventory for a node.
pub fn getNodeInventory(
    allocator: std.mem.Allocator,
    client: *Client,
    node_id: []const u8,
    refresh: bool,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = if (refresh)
        try std.fmt.allocPrint(allocator, "/nodes/{s}/host/inventory?refresh=true", .{node_id})
    else
        try std.fmt.allocPrint(allocator, "/nodes/{s}/host/inventory", .{node_id});
    defer allocator.free(path);

    const response = try client.get(path);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Updates host packages on a node.
pub fn updateNodePackages(
    allocator: std.mem.Allocator,
    client: *Client,
    node_id: []const u8,
    packages_csv: ?[]const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/nodes/{s}/host/packages/update", .{node_id});
    defer allocator.free(path);

    const body = if (packages_csv) |csv| blk: {
        var json = std.ArrayListUnmanaged(u8).empty;
        defer json.deinit(allocator);
        try json.appendSlice(allocator, "{\"packages\":[");
        var parts = std.mem.splitScalar(u8, csv, ',');
        var first = true;
        while (parts.next()) |part| {
            const trimmed = std.mem.trim(u8, part, " \t\r\n");
            if (trimmed.len == 0) continue;
            if (!first) try json.append(allocator, ',');
            try json.append(allocator, '"');
            try json.appendSlice(allocator, trimmed);
            try json.append(allocator, '"');
            first = false;
        }
        try json.appendSlice(allocator, "]}");
        break :blk try json.toOwnedSlice(allocator);
    } else try allocator.dupe(u8, "{}");
    defer allocator.free(body);

    const response = try client.postJson(path, body);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Performs a full host system update on a node.
pub fn updateNodeSystem(
    allocator: std.mem.Allocator,
    client: *Client,
    node_id: []const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/nodes/{s}/host/system/update", .{node_id});
    defer allocator.free(path);

    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists host update runs for a node.
pub fn getNodeUpdates(
    allocator: std.mem.Allocator,
    client: *Client,
    node_id: []const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/nodes/{s}/host/updates", .{node_id});
    defer allocator.free(path);

    const response = try client.get(path);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists cluster services.
pub fn getServices(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/services");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists cluster instances.
pub fn getInstances(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/instances");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists cluster volumes.
pub fn getVolumes(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/volumes");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists cluster secrets metadata.
pub fn getSecrets(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/secrets");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists pipeline runs.
pub fn listRuns(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/runs");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Returns a pipeline run by identifier.
pub fn getRun(allocator: std.mem.Allocator, client: *Client, run_id: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/runs/{s}", .{run_id});
    defer allocator.free(path);
    const response = try client.get(path);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Prints pipeline run timeline events.
pub fn getRunLogs(
    allocator: std.mem.Allocator,
    client: *Client,
    run_id: []const u8,
    step_name: ?[]const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/runs/{s}/events", .{run_id});
    defer allocator.free(path);
    const response = try client.get(path);
    defer allocator.free(response.body);

    if (step_name == null) {
        try printJson(stdout, response.body);
        return;
    }

    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        response.body,
        .{},
    );
    defer parsed.deinit();

    if (parsed.value != .array) {
        try printJson(stdout, response.body);
        return;
    }

    var filtered = try std.ArrayList(std.json.Value).initCapacity(allocator, 16);
    defer filtered.deinit(allocator);

    for (parsed.value.array.items) |item| {
        if (item != .object) {
            continue;
        }

        const metadata = item.object.get("metadata") orelse continue;
        if (metadata != .object) {
            continue;
        }

        const step_value = metadata.object.get("stepName") orelse continue;
        if (step_value == .string and std.mem.eql(u8, step_value.string, step_name.?)) {
            try filtered.append(allocator, item);
        }
    }

    const encoded = try std.json.Stringify.valueAlloc(allocator, filtered.items, .{});
    defer allocator.free(encoded);
    try printJson(stdout, encoded);
}

/// Continues a pipeline run paused at awaiting_approval.
pub fn continueRun(allocator: std.mem.Allocator, client: *Client, run_id: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/runs/{s}/continue", .{run_id});
    defer allocator.free(path);
    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Aborts a running or gated pipeline run.
pub fn abortRun(allocator: std.mem.Allocator, client: *Client, run_id: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/runs/{s}/abort", .{run_id});
    defer allocator.free(path);
    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists backup runs.
pub fn getBackups(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/backups");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Prints cluster status.
pub fn clusterStatus(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/cluster/status");
    defer allocator.free(response.body);
    try stdout.print("{s}\n", .{i18n.t("clusterHealthy")});
    try printJson(stdout, response.body);
}

/// Applies a compose manifest file.
pub fn applyManifest(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
    // Path to the manifest YAML file.
    manifest_path: []const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const manifest_buffer = try allocator.alloc(u8, 8 * 1024 * 1024);
    defer allocator.free(manifest_buffer);

    const manifest_slice = try std.Io.Dir.readFile(std.Io.Dir.cwd(), client.io, manifest_path, manifest_buffer);
    const manifest = try allocator.dupe(u8, manifest_slice);
    defer allocator.free(manifest);

    const body = try std.json.Stringify.valueAlloc(allocator, .{ .manifest = manifest }, .{});
    defer allocator.free(body);

    const response = try client.postJson("/apply", body);
    defer allocator.free(response.body);

    try stdout.print("{s}\n", .{i18n.t("applySuccess")});
    try printJson(stdout, response.body);
}

/// Invokes a function service by name.
pub fn invokeFunction(
    allocator: std.mem.Allocator,
    client: *Client,
    name: []const u8,
    payload_flag: ?[]const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    var payload_value: ?[]const u8 = null;
    var payload_owned: ?[]u8 = null;
    defer if (payload_owned) |owned| allocator.free(owned);

    if (payload_flag) |flag| {
        if (flag.len > 1 and flag[0] == '@') {
            const file_path = flag[1..];
            const buffer = try allocator.alloc(u8, 2 * 1024 * 1024);
            defer allocator.free(buffer);
            const slice = try std.Io.Dir.readFile(std.Io.Dir.cwd(), client.io, file_path, buffer);
            payload_owned = try allocator.dupe(u8, slice);
            payload_value = payload_owned;
        } else {
            payload_value = flag;
        }
    }

    const body = if (payload_value) |payload_text|
        try std.fmt.allocPrint(allocator, "{{\"payload\":{s}}}", .{payload_text})
    else
        try allocator.dupe(u8, "{}");
    defer allocator.free(body);

    const path = try std.fmt.allocPrint(allocator, "/functions/{s}/invoke", .{name});
    defer allocator.free(path);
    const response = try client.postJson(path, body);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists function runs for a function by name.
pub fn listFunctionRuns(
    allocator: std.mem.Allocator,
    client: *Client,
    name: []const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/functions/{s}/runs", .{name});
    defer allocator.free(path);
    const response = try client.get(path);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Gets a function run by name and run id.
pub fn getFunctionRun(
    allocator: std.mem.Allocator,
    client: *Client,
    name: []const u8,
    run_id: []const u8,
) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/functions/{s}/runs/{s}", .{ name, run_id });
    defer allocator.free(path);
    const response = try client.get(path);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Deletes a cluster resource by kind and name.
pub fn deleteResource(allocator: std.mem.Allocator, client: *Client, kind: []const u8, name: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/{s}/{s}", .{ resourcePath(kind), name });
    defer allocator.free(path);

    _ = try client.delete(path);
    try stdout.print("Deleted {s} {s}\n", .{ kind, name });
}

fn resourcePath(kind: []const u8) []const u8 {
    if (std.mem.eql(u8, kind, "service")) {
        return "services";
    } else if (std.mem.eql(u8, kind, "volume")) {
        return "volumes";
    } else if (std.mem.eql(u8, kind, "secret")) {
        return "secrets";
    } else {
        return kind;
    }
}

/// Fetches instance logs.
pub fn fetchLogs(allocator: std.mem.Allocator, client: *Client, instance_id: []const u8, tail: u32) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(
        allocator,
        "/instances/{s}/logs?tail={d}",
        .{ instance_id, tail },
    );
    defer allocator.free(path);

    const response = try client.get(path);
    defer allocator.free(response.body);

    var parsed = try std.json.parseFromSlice(
        struct { lines: [][]const u8 },
        allocator,
        response.body,
        .{},
    );
    defer parsed.deinit();

    for (parsed.value.lines) |line| {
        try stdout.print("{s}\n", .{line});
    }
}

/// Rotates logs for a service.
pub fn rotateLogs(allocator: std.mem.Allocator, client: *Client, service_name: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/services/{s}/logs/rotate", .{service_name});
    defer allocator.free(path);

    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Executes a command inside an instance.
pub fn execInstance(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
    // Target instance identifier.
    instance_id: []const u8,
    // Command argv to execute.
    command_argv: []const []const u8,
) !u8 {
    const stdout = io_output.stdoutWriter();
    const stderr = io_output.stderrWriter();
    const path = try std.fmt.allocPrint(allocator, "/instances/{s}/exec", .{instance_id});
    defer allocator.free(path);

    const body = try std.json.Stringify.valueAlloc(allocator, .{ .command = command_argv }, .{});
    defer allocator.free(body);

    const response = try client.postJson(path, body);
    defer allocator.free(response.body);

    var parsed = try std.json.parseFromSlice(
        struct {
            stdout: []const u8,
            stderr: []const u8,
            exitCode: i32,
        },
        allocator,
        response.body,
        .{},
    );
    defer parsed.deinit();

    try stdout.writeAll(parsed.value.stdout);
    try stderr.writeAll(parsed.value.stderr);
    return @intCast(parsed.value.exitCode);
}

/// Triggers a service build.
pub fn triggerBuild(
    allocator: std.mem.Allocator,
    client: *Client,
    service_name: []const u8,
    provider: ?[]const u8,
    registry: ?[]const u8,
) !void {
    const stdout = io_output.stdoutWriter();

    const body = try std.json.Stringify.valueAlloc(allocator, .{
        .serviceName = service_name,
        .provider = provider,
        .registry = registry,
    }, .{});
    defer allocator.free(body);

    const response = try client.postJson("/build", body);
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists configured registries.
pub fn listRegistries(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/registry");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists ingress routes.
pub fn listIngress(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/ingress");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Runs a volume backup.
pub fn runBackup(allocator: std.mem.Allocator, client: *Client, volume_name: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/backups/{s}/run", .{volume_name});
    defer allocator.free(path);

    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Restores a backup run.
pub fn restoreBackup(allocator: std.mem.Allocator, client: *Client, backup_id: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/backups/{s}/restore", .{backup_id});
    defer allocator.free(path);

    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists GitOps revisions.
pub fn getGitOpsRevisions(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/gitops/revisions");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Rolls back to a GitOps revision.
pub fn rollbackGitOps(allocator: std.mem.Allocator, client: *Client, revision_id: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const path = try std.fmt.allocPrint(allocator, "/gitops/rollback/{s}", .{revision_id});
    defer allocator.free(path);

    const response = try client.postJson(path, "{}");
    defer allocator.free(response.body);
    try stdout.print("{s}\n", .{i18n.t("rollbackSuccess")});
    try printJson(stdout, response.body);
}

/// Returns NetBird topology summary.
pub fn getNetBirdTopology(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/netbird/topology");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists NetBird devices.
pub fn getNetBirdDevices(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/netbird/devices");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists NetBird groups.
pub fn getNetBirdGroups(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/netbird/groups");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Lists NetBird ACL rules.
pub fn getNetBirdAcls(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/netbird/acls");
    defer allocator.free(response.body);
    try printJson(stdout, response.body);
}

/// Returns Prometheus metrics in text format.
pub fn getMetrics(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/metrics");
    defer allocator.free(response.body);
    try stdout.writeAll(response.body);
}
