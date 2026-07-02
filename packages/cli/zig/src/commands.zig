const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const i18n = @import("i18n.zig");
const io_output = @import("io_output.zig");

/// Writes JSON to stdout with a trailing newline.
pub fn printJson(stdout: anytype, body: []const u8) !void {
    try stdout.print("{s}\n", .{body});
}

/// Lists cluster nodes.
pub fn getNodes(allocator: std.mem.Allocator, client: *Client) !void {
    const stdout = io_output.stdoutWriter();
    const response = try client.get("/nodes");
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
pub fn applyManifest(allocator: std.mem.Allocator, client: *Client, manifest_path: []const u8) !void {
    const stdout = io_output.stdoutWriter();
    const manifest_buffer = try allocator.alloc(u8, 8 * 1024 * 1024);
    defer allocator.free(manifest_buffer);

    const manifest_slice = try std.Io.Dir.cwd().readFile(client.io, manifest_path, manifest_buffer);
    const manifest = try allocator.dupe(u8, manifest_slice);
    defer allocator.free(manifest);

    const body = try std.json.Stringify.valueAlloc(allocator, .{ .manifest = manifest }, .{});
    defer allocator.free(body);

    const response = try client.postJson("/apply", body);
    defer allocator.free(response.body);

    try stdout.print("{s}\n", .{i18n.t("applySuccess")});
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
    if (std.mem.eql(u8, kind, "service")) return "services";
    if (std.mem.eql(u8, kind, "volume")) return "volumes";
    if (std.mem.eql(u8, kind, "secret")) return "secrets";
    return kind;
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
pub fn execInstance(allocator: std.mem.Allocator, client: *Client, instance_id: []const u8, command_argv: []const []const u8) !u8 {
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
