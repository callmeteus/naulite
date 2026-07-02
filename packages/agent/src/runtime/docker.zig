const std = @import("std");
const execution_plan = @import("../execution_plan.zig");
const cp_client = @import("../cp_client.zig");
const docker_api = @import("docker_api.zig");

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
            .cp_config = cp_client.loadConfig(allocator) catch null,
        };
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

        for (plan.operations) |op| {
            try self.dispatchOperation(&api, op);
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
        _ = self;
        _ = instance_id;
        _ = command;
        return .{
            .exit_code = 0,
            .stdout = "exec not fully implemented",
            .stderr = "",
        };
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
            .connectNetwork, .disconnectNetwork => {},
        }
    }

    fn handlePull(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const image = try readStringField(self.allocator, raw_json, "image");
        defer self.allocator.free(image);
        try api.pullImage(image);
    }

    fn handleCreate(self: *DockerClient, api: *const docker_api.DockerApi, raw_json: []const u8) !void {
        const instance_id = try readStringField(self.allocator, raw_json, "instanceId");
        defer self.allocator.free(instance_id);

        const image = try readStringField(self.allocator, raw_json, "image");
        defer self.allocator.free(image);

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

        const container_id = try api.createContainer(
            container_name,
            image,
            command,
            env_pairs,
            port_bindings_json,
            binds_json,
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

    fn sanitizeContainerName(allocator: std.mem.Allocator, instance_id: []const u8) ![]u8 {
        var output = try allocator.alloc(u8, instance_id.len);
        for (instance_id, 0..) |char, index| {
            output[index] = if (char == ':') '-' else char;
        }
        return output;
    }

    fn readStringField(allocator: std.mem.Allocator, raw_json: []const u8, field_name: []const u8) ![]u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) return error.InvalidOperationJson;

        const value = root.object.get(field_name) orelse return error.MissingOperationField;
        return switch (value) {
            .string => |s| try allocator.dupe(u8, s),
            else => error.InvalidOperationField,
        };
    }

    fn readBoolField(raw_json: []const u8, field_name: []const u8, default_value: bool) !bool {
        const parsed = try std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, raw_json, .{});
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) return default_value;

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
        if (root != .object) return &[_][]const u8{};

        const value = root.object.get(field_name) orelse return &[_][]const u8{};
        if (value != .array) return &[_][]const u8{};

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
        if (root != .object) return &[_][]const u8{};

        const value = root.object.get("environment") orelse return &[_][]const u8{};
        if (value != .object) return &[_][]const u8{};

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
        if (root != .object) return try allocator.dupe(u8, "{}");

        const ports_value = root.object.get("ports") orelse return try allocator.dupe(u8, "{}");
        if (ports_value != .array or ports_value.array.items.len == 0) {
            return try allocator.dupe(u8, "{}");
        }

        var output: std.ArrayList(u8) = .empty;
        defer output.deinit(allocator);
        try output.append(allocator, '{');

        for (ports_value.array.items, 0..) |port_item, index| {
            if (port_item != .object) continue;
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

            if (index > 0) try output.append(allocator, ',');
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
        if (root != .object) return try allocator.dupe(u8, "[]");

        const volumes_value = root.object.get("volumes") orelse return try allocator.dupe(u8, "[]");
        if (volumes_value != .array or volumes_value.array.items.len == 0) {
            return try allocator.dupe(u8, "[]");
        }

        var output: std.ArrayList(u8) = .empty;
        defer output.deinit(allocator);
        try output.append(allocator, '[');

        for (volumes_value.array.items, 0..) |volume_item, index| {
            if (volume_item != .object) continue;
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

            if (index > 0) try output.append(allocator, ',');
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
};

pub const ExecResult = struct {
    // Process exit code from the exec session.
    exit_code: i32,

    // Captured stdout text.
    stdout: []const u8,

    // Captured stderr text.
    stderr: []const u8,
};
