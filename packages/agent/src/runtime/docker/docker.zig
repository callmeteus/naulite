const std = @import("std");
const execution_plan = @import("../../execution_plan.zig");
const cp_client = @import("../../cp_client.zig");
const process_cmd = @import("../../process_cmd.zig");
const blocking_io = @import("../../blocking_io.zig");
const docker_api = @import("docker_api.zig");
const docker_stats = @import("docker_stats.zig");

pub const ResourceSnapshot = docker_stats.Snapshot;

/// Converts a control plane instance id into a Docker-safe container name.
pub fn sanitizeContainerName(allocator: std.mem.Allocator, instance_id: []const u8) ![]u8 {
    var output = try allocator.alloc(u8, instance_id.len);
    for (instance_id, 0..) |char, index| {
        output[index] = if (char == ':') '-' else char;
    }
    return output;
}

pub const DockerClient = struct {
    // Path to the Docker Unix socket or named pipe.
    socket_path: []const u8,

    // The allocator to use.
    allocator: std.mem.Allocator,

    // Optional control plane configuration for status callbacks.
    cp_config: ?cp_client.Config,

    /// Creates a Docker client bound to a socket path.
    pub fn init(
        allocator: std.mem.Allocator,
        // Path to the Docker socket.
        socket_path: []const u8,
    ) DockerClient {
        return .{
            .socket_path = socket_path,
            .allocator = allocator,
            .cp_config = cp_client.loadConfigSnapshot(allocator),
        };
    }

    /// Releases owned control plane configuration loaded during init.
    pub fn deinit(self: *DockerClient) void {
        if (self.cp_config) |*config| {
            config.deinit(self.allocator);
            self.cp_config = null;
        }
    }

    /// Applies an execution plan by dispatching each operation to the Docker API.
    pub fn applyPlan(
        self: *DockerClient,
        // Parsed execution plan from the control plane.
        plan: execution_plan.ExecutionPlan,
    ) !void {
        std.log.info(
            "[docker] apply planId={s} revision={d} operations={d}",
            .{ plan.plan_id, plan.revision, plan.operations.len },
        );

        const api = docker_api.DockerApi.init(self.allocator, self.socket_path);

        if (plan.run_id) |run_id| {
            if (self.cp_config) |config| {
                cp_client.reportRunEvent(
                    self.allocator,
                    config,
                    run_id,
                    "rollout.started",
                    null,
                    null,
                    null,
                );
            }
        }

        for (plan.operations) |op| {
            const step_name = @tagName(op.op_type);
            if (plan.run_id) |run_id| {
                if (self.cp_config) |config| {
                    cp_client.reportRunEvent(
                        self.allocator,
                        config,
                        run_id,
                        "deploy.step.started",
                        step_name,
                        null,
                        null,
                    );
                }
            }

            self.dispatchOperation(&api, op) catch |err| {
                std.log.err(
                    "[docker] dispatch op={s} failed err={} raw_json={s}",
                    .{ @tagName(op.op_type), err, op.raw_json },
                );
                if (plan.run_id) |run_id| {
                    if (self.cp_config) |config| {
                        const message = std.fmt.allocPrint(
                            self.allocator,
                            "operation failed: {}",
                            .{err},
                        ) catch null;
                        defer if (message) |value| self.allocator.free(value);
                        cp_client.reportRunEvent(
                            self.allocator,
                            config,
                            run_id,
                            "deploy.step.failed",
                            step_name,
                            message,
                            null,
                        );
                    }
                }
                return err;
            };

            if (plan.run_id) |run_id| {
                if (self.cp_config) |config| {
                    cp_client.reportRunEvent(
                        self.allocator,
                        config,
                        run_id,
                        "deploy.step.finished",
                        step_name,
                        null,
                        null,
                    );
                }
            }
        }

        if (plan.run_id) |run_id| {
            if (self.cp_config) |config| {
                cp_client.reportRunEvent(
                    self.allocator,
                    config,
                    run_id,
                    "rollout.finished",
                    null,
                    null,
                    null,
                );
            }
        }
    }

    /// Fetches container logs for an instance.
    pub fn getContainerLogs(
        self: *DockerClient,
        // Instance identifier from the control plane.
        instance_id: []const u8,
        // Maximum number of log lines to return.
        tail: ?usize,
    ) ![]const u8 {
        const api = docker_api.DockerApi.init(self.allocator, self.socket_path);
        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        return api.containerLogs(container_name, tail);
    }

    /// Executes a command inside a running container.
    pub fn execContainer(
        self: *DockerClient,
        // Instance identifier from the control plane.
        instance_id: []const u8,
        // Command argv to run inside the container.
        command: []const []const u8,
    ) !ExecResult {
        const api = docker_api.DockerApi.init(self.allocator, self.socket_path);
        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        const result = try api.execContainer(container_name, command);
        return .{
            .exit_code = result.exit_code,
            .stdout = result.stdout,
            .stderr = result.stderr,
        };
    }

    /// Collects node resource telemetry from Docker.
    pub fn collectNodeResources(self: *const DockerClient) !ResourceSnapshot {
        return docker_stats.collect(self.allocator, self.socket_path);
    }

    fn dispatchOperation(
        self: *DockerClient,
        api: *const docker_api.DockerApi,
        op: execution_plan.ExecutionPlan.Operation,
    ) !void {
        std.log.debug("[docker] dispatch type={s}", .{@tagName(op.op_type)});

        switch (op.op_type) {
            .pull => try self.handlePull(api, op.raw_json),
            .create => try self.handleCreate(api, op.raw_json),
            .start => try self.handleStart(api, op.raw_json),
            .stop => try self.handleStop(api, op.raw_json),
            .remove => try self.handleRemove(api, op.raw_json),
            .ensureVolume => try self.handleEnsureVolume(api, op.raw_json),
            .removeVolume => try self.handleRemoveVolume(api, op.raw_json),
            .connectNetwork => try self.handleConnectNetwork(api, op.raw_json),
            .disconnectNetwork => try self.handleDisconnectNetwork(api, op.raw_json),
        }
    }

    fn handlePull(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const image = try readStringField(self.allocator, raw_json, "image");
        defer self.allocator.free(image);

        if (std.mem.startsWith(u8, image, "container-registry://")) {
            try self.pullFromContainerRegistry(api, image);
            return;
        }

        if (std.mem.startsWith(u8, image, "naulite-cr/")) {
            std.log.debug("[docker] skip pull for local naulite-cr image={s}", .{image});
            return;
        }

        try api.pullImage(image);
    }

    fn pullFromContainerRegistry(self: *DockerClient, api: *const docker_api.DockerApi, image: []const u8) !void {
        const config = self.cp_config orelse return error.MissingControlPlaneConfig;
        const spec = parseContainerRegistryRef(self.allocator, image) orelse return error.InvalidContainerRegistryRef;
        defer self.allocator.free(spec.name);
        defer self.allocator.free(spec.tag);

        const archive_path = try cp_client.getRegistryImage(
            self.allocator,
            config.cp_url,
            spec.name,
            spec.tag,
            config.api_key,
        );
        defer self.allocator.free(archive_path);
        defer std.Io.Dir.cwd().deleteFile(blocking_io.io(), archive_path) catch {};

        try runDockerLoad(self.allocator, self.socket_path, archive_path);

        const source_tag = try std.fmt.allocPrint(self.allocator, "naulite/{s}:{s}", .{ spec.name, spec.tag });
        defer self.allocator.free(source_tag);

        const target_tag = try std.fmt.allocPrint(self.allocator, "naulite-cr/{s}:{s}", .{ spec.name, spec.tag });
        defer self.allocator.free(target_tag);

        try runDockerTag(self.allocator, self.socket_path, source_tag, target_tag);
        std.log.info("[docker] loaded platform registry image source={s} target={s}", .{ source_tag, target_tag });
        _ = api;
    }

    fn handleCreate(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const image = try readStringField(self.allocator, raw_json, "image");
        defer self.allocator.free(image);

        const runtime_image = try resolveRuntimeDockerImage(self.allocator, image);
        defer self.allocator.free(runtime_image);

        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        const command = try readStringArrayField(self.allocator, raw_json, "command");
        defer freeStringArray(self.allocator, command);

        const env_pairs = try readEnvObject(self.allocator, raw_json);
        defer freeStringArray(self.allocator, env_pairs);

        const port_bindings_json = try buildPortBindingsJson(self.allocator, raw_json);
        defer self.allocator.free(port_bindings_json);

        const binds_json = try buildBindsJson(self.allocator, raw_json);
        defer self.allocator.free(binds_json);

        const service_name_owned = try readOptionalStringField(self.allocator, raw_json, "serviceName");
        const service_name = service_name_owned orelse "-";
        defer if (service_name_owned) |owned| self.allocator.free(owned);

        const labels_json = try buildPlatformLabelsJson(self.allocator, instance_id, service_name);
        defer self.allocator.free(labels_json);

        const container_id = try api.createContainer(
            container_name,
            runtime_image,
            command,
            env_pairs,
            port_bindings_json,
            binds_json,
            labels_json,
        );
        defer self.allocator.free(container_id);

        std.log.info("[docker] created container name={s} id={s}", .{ container_name, container_id });
    }

    fn handleStart(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        try api.startContainer(container_name);
        std.log.info("[docker] started container name={s}", .{container_name});
        if (self.cp_config) |config| {
            cp_client.reportInstanceRunning(self.allocator, config, instance_id);
        }
    }

    fn handleStop(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        try api.stopContainer(container_name);
        if (self.cp_config) |config| {
            cp_client.reportInstanceStopped(self.allocator, config, instance_id);
        }
    }

    fn handleRemove(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const force = try readBoolField(raw_json, "force", true);
        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        try api.removeContainer(container_name, force);
        if (self.cp_config) |config| {
            cp_client.reportInstanceStopped(self.allocator, config, instance_id);
        }
    }

    fn handleEnsureVolume(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const volume_name = try readStringField(self.allocator, raw_json, "volumeName");
        defer self.allocator.free(volume_name);
        try api.ensureVolume(volume_name);
    }

    fn handleRemoveVolume(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const volume_name = try readStringField(self.allocator, raw_json, "volumeName");
        defer self.allocator.free(volume_name);

        const force = try readBoolField(raw_json, "force", false);
        try api.removeVolume(volume_name, force);
        std.log.info("[docker] removed volume name={s}", .{volume_name});
    }

    fn handleConnectNetwork(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const network_name = try readStringField(self.allocator, raw_json, "networkName");
        defer self.allocator.free(network_name);

        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        try api.connectNetwork(network_name, container_name);
        std.log.info("[docker] connected container={s} network={s}", .{ container_name, network_name });
    }

    fn handleDisconnectNetwork(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const network_name = try readStringField(self.allocator, raw_json, "networkName");
        defer self.allocator.free(network_name);

        const force = try readBoolField(raw_json, "force", true);
        const container_name = try sanitizeContainerName(self.allocator, instance_id);
        defer self.allocator.free(container_name);

        try api.disconnectNetwork(network_name, container_name, force);
        std.log.info("[docker] disconnected container={s} network={s}", .{ container_name, network_name });
    }

    fn readStringField(allocator: std.mem.Allocator, raw_json: []const u8, field_name: []const u8) ![]u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return error.InvalidOperationJson;
        }

        const value = root.object.get(field_name) orelse return error.MissingOperationField;
        return switch (value) {
            .string => |s| try allocator.dupe(u8, s),
            else => error.InvalidOperationField,
        };
    }

    fn readOptionalStringField(allocator: std.mem.Allocator, raw_json: []const u8, field_name: []const u8) !?[]const u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return null;
        }

        const value = root.object.get(field_name) orelse return null;
        return switch (value) {
            .string => |s| try allocator.dupe(u8, s),
            else => null,
        };
    }

    fn buildPlatformLabelsJson(
        allocator: std.mem.Allocator,
        instance_id: []const u8,
        service_name: []const u8,
    ) ![]u8 {
        return std.fmt.allocPrint(
            allocator,
            "{{\"naulite.managed\":\"true\",\"naulite.instance.id\":\"{s}\",\"naulite.service.name\":\"{s}\"}}",
            .{ instance_id, service_name },
        );
    }

    fn readBoolField(raw_json: []const u8, field_name: []const u8, default_value: bool) !bool {
        const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return default_value;
        }

        const value = root.object.get(field_name) orelse return default_value;
        return switch (value) {
            .bool => |b| b,
            else => default_value,
        };
    }

    fn readStringArrayField(
        allocator: std.mem.Allocator,
        raw_json: []const u8,
        field_name: []const u8,
    ) ![]const []const u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return &[_][]const u8{};
        }

        const value = root.object.get(field_name) orelse return &[_][]const u8{};
        if (value != .array) {
            return &[_][]const u8{};
        }

        const values = try allocator.alloc([]const u8, value.array.items.len);
        for (value.array.items, 0..) |item, index| {
            values[index] = switch (item) {
                .string => |s| try allocator.dupe(u8, s),
                else => return error.InvalidOperationField,
            };
        }

        return values;
    }

    fn readEnvObject(allocator: std.mem.Allocator, raw_json: []const u8) ![]const []const u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return &[_][]const u8{};
        }

        const value = root.object.get("environment") orelse return &[_][]const u8{};
        if (value != .object) {
            return &[_][]const u8{};
        }

        var pairs: std.ArrayList([]const u8) = .empty;
        errdefer {
            for (pairs.items) |pair| allocator.free(pair);
            pairs.deinit(allocator);
        }

        var iterator = value.object.iterator();
        while (iterator.next()) |entry| {
            const entry_value = entry.value_ptr.*;
            const value_text = switch (entry_value) {
                .string => |s| s,
                else => continue,
            };
            const pair = try std.fmt.allocPrint(allocator, "{s}={s}", .{ entry.key_ptr.*, value_text });
            try pairs.append(allocator, pair);
        }

        return try pairs.toOwnedSlice(allocator);
    }

    fn buildPortBindingsJson(allocator: std.mem.Allocator, raw_json: []const u8) ![]u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return try allocator.dupe(u8, "{}");
        }

        const ports_value = root.object.get("ports") orelse return try allocator.dupe(u8, "{}");
        if (ports_value != .array or ports_value.array.items.len == 0) {
            return try allocator.dupe(u8, "{}");
        }

        var output: std.ArrayList(u8) = .empty;
        defer output.deinit(allocator);
        try output.append(allocator, '{');

        for (ports_value.array.items, 0..) |port_item, index| {
            if (port_item != .object) {
                continue;
            }
            const container_port_value = port_item.object.get("containerPort") orelse continue;
            const container_port: i64 = switch (container_port_value) {
                .integer => |n| n,
                .float => |n| @intFromFloat(n),
                else => continue,
            };

            const host_port: i64 = blk: {
                if (port_item.object.get("hostPort")) |host_value| {
                    break :blk switch (host_value) {
                        .integer => |n| n,
                        .float => |n| @intFromFloat(n),
                        else => container_port,
                    };
                }
                break :blk container_port;
            };

            const protocol = blk: {
                if (port_item.object.get("protocol")) |protocol_value| {
                    break :blk switch (protocol_value) {
                        .string => |s| s,
                        else => "tcp",
                    };
                }
                break :blk "tcp";
            };

            if (index > 0) {
                try output.append(allocator, ',');
            }
            const binding = try std.fmt.allocPrint(
                allocator,
                "\"{d}/{s}\":[{{\"HostPort\":\"{d}\"}}]",
                .{ container_port, protocol, host_port },
            );
            defer allocator.free(binding);
            try output.appendSlice(allocator, binding);
        }

        try output.append(allocator, '}');
        return try output.toOwnedSlice(allocator);
    }

    fn buildBindsJson(allocator: std.mem.Allocator, raw_json: []const u8) ![]u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return try allocator.dupe(u8, "[]");
        }

        const volumes_value = root.object.get("volumes") orelse return try allocator.dupe(u8, "[]");
        if (volumes_value != .array or volumes_value.array.items.len == 0) {
            return try allocator.dupe(u8, "[]");
        }

        var output: std.ArrayList(u8) = .empty;
        defer output.deinit(allocator);
        try output.append(allocator, '[');

        for (volumes_value.array.items, 0..) |volume_item, index| {
            if (volume_item != .object) {
                continue;
            }
            const volume_name = volume_item.object.get("volumeName") orelse continue;
            const mount_path = volume_item.object.get("mountPath") orelse continue;
            const volume_name_text = switch (volume_name) {
                .string => |s| s,
                else => continue,
            };
            const mount_path_text = switch (mount_path) {
                .string => |s| s,
                else => continue,
            };
            const read_only = blk: {
                if (volume_item.object.get("readOnly")) |read_only_value| {
                    break :blk switch (read_only_value) {
                        .bool => |b| b,
                        else => false,
                    };
                }
                break :blk false;
            };

            if (index > 0) {
                try output.append(allocator, ',');
            }
            const bind_entry = if (read_only)
                try std.fmt.allocPrint(allocator, "\"{s}:{s}:ro\"", .{ volume_name_text, mount_path_text })
            else
                try std.fmt.allocPrint(allocator, "\"{s}:{s}\"", .{ volume_name_text, mount_path_text });
            defer allocator.free(bind_entry);
            try output.appendSlice(allocator, bind_entry);
        }

        try output.append(allocator, ']');
        return try output.toOwnedSlice(allocator);
    }

    fn freeStringArray(allocator: std.mem.Allocator, values: []const []const u8) void {
        for (values) |value| {
            allocator.free(value);
        }
        allocator.free(values);
    }

    const ContainerRegistrySpec = struct {
        name: []const u8,
        tag: []const u8,
    };

    fn parseContainerRegistryRef(allocator: std.mem.Allocator, image: []const u8) ?ContainerRegistrySpec {
        const prefix = "container-registry://";
        if (!std.mem.startsWith(u8, image, prefix)) {
            return null;
        }

        const remainder = image[prefix.len..];
        const separator = std.mem.lastIndexOfScalar(u8, remainder, ':') orelse return null;
        if (separator == 0 or separator >= remainder.len - 1) {
            return null;
        }

        const name = allocator.dupe(u8, remainder[0..separator]) catch return null;
        const tag = allocator.dupe(u8, remainder[separator + 1 ..]) catch {
            allocator.free(name);
            return null;
        };

        return .{ .name = name, .tag = tag };
    }

    fn resolveRuntimeDockerImage(allocator: std.mem.Allocator, image: []const u8) ![]const u8 {
        if (std.mem.startsWith(u8, image, "container-registry://")) {
            const spec = parseContainerRegistryRef(allocator, image) orelse return error.InvalidContainerRegistryRef;
            defer allocator.free(spec.name);
            defer allocator.free(spec.tag);
            return std.fmt.allocPrint(allocator, "naulite-cr/{s}:{s}", .{ spec.name, spec.tag });
        }

        return allocator.dupe(u8, image);
    }

    fn runDockerLoad(allocator: std.mem.Allocator, docker_socket: []const u8, archive_path: []const u8) !void {
        const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
        defer allocator.free(docker_host);

        const args = [_][]const u8{ "docker", "-H", docker_host, "load", "-i", archive_path };
        process_cmd.runCommandVoid(allocator, &args) catch return error.DockerLoadFailed;
    }

    fn runDockerTag(
        allocator: std.mem.Allocator,
        docker_socket: []const u8,
        source_image: []const u8,
        target_image: []const u8,
    ) !void {
        const docker_host = try std.fmt.allocPrint(allocator, "unix://{s}", .{docker_socket});
        defer allocator.free(docker_host);

        const args = [_][]const u8{ "docker", "-H", docker_host, "tag", source_image, target_image };
        process_cmd.runCommandVoid(allocator, &args) catch return error.DockerTagFailed;
    }
};

pub const ExecResult = docker_api.ExecResult;
