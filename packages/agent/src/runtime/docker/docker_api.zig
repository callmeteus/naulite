const logger = @import("logger");

const log_docker = logger.Logger.create("docker");

const std = @import("std");

const blocking_io = @import("../../blocking_io.zig");

/// Minimum Docker Engine API version supported by current daemons.
const docker_api_version = "v1.44";

/// Platform-managed container metadata used for metrics collection.
pub const ManagedContainer = struct {
    // Docker container identifier.
    docker_id: []const u8,

    // Control plane instance identifier.
    instance_id: []const u8,

    // Manifest service name.
    service_name: []const u8,
};

/// HTTP response from the Docker Engine API.
pub const DockerResponse = struct {
    // The HTTP status code.
    status: u16,

    // The response body.
    body: []u8,

    // Deinitializes the Docker response.
    pub fn deinit(
        self: *DockerResponse,
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) void {
        allocator.free(self.body);
    }
};

/// Low-level Docker Engine HTTP client over a Unix socket.
pub const DockerApi = struct {
    // The allocator to use.
    allocator: std.mem.Allocator,

    // The path to the Docker socket.
    socket_path: []const u8,

    /// Creates a Docker API client bound to a Unix socket path.
    pub fn init(
        allocator: std.mem.Allocator,
        // The path to the Docker socket.
        socket_path: []const u8,
    ) DockerApi {
        return .{
            .allocator = allocator,
            .socket_path = socket_path,
        };
    }

    /// Performs an HTTP request against the Docker Engine API.
    pub fn request(
        self: *const DockerApi,
        // The HTTP method.
        method: []const u8,
        // The API path.
        path: []const u8,
        // The request body.
        body: ?[]const u8,
    ) !DockerResponse {
        const io = blocking_io.io();

        const unix_address = try std.Io.net.UnixAddress.init(self.socket_path);
        var stream = try unix_address.connect(io);
        defer stream.close(io);

        var write_buffer: [8192]u8 = undefined;
        var net_writer = stream.writer(io, &write_buffer);

        if (body) |payload| {
            try std.Io.Writer.print(
                &net_writer.interface,
                "{s} {s} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {d}\r\nConnection: close\r\n\r\n{s}",
                .{ method, path, payload.len, payload },
            );
        } else {
            try std.Io.Writer.print(
                &net_writer.interface,
                "{s} {s} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n",
                .{ method, path },
            );
        }

        try std.Io.Writer.flush(&net_writer.interface);

        var response_buffer: std.ArrayList(u8) = .empty;
        defer response_buffer.deinit(self.allocator);

        var read_buffer: [4096]u8 = undefined;
        while (true) {
            var net_reader = stream.reader(io, &read_buffer);
            const read_count = std.Io.Reader.readSliceShort(&net_reader.interface, read_buffer[0..]) catch |err| {
                if (response_buffer.items.len > 0) {
                    break;
                }

                return err;
            };

            if (read_count == 0) {
                break;
            }

            try response_buffer.appendSlice(self.allocator, read_buffer[0..read_count]);
        }

        return try parseHttpResponse(self.allocator, response_buffer.items);
    }

    /// Pulls a container image reference.
    pub fn pullImage(
        self: *const DockerApi,
        // The container image reference.
        image: []const u8,
    ) !void {
        const tag_sep = std.mem.lastIndexOfScalar(u8, image, ':') orelse image.len;
        const repo = image[0..tag_sep];
        const tag = if (tag_sep < image.len) image[tag_sep + 1 ..] else "latest";

        const path = try std.fmt.allocPrint(
            self.allocator,
            "/v1.44/images/create?fromImage={s}&tag={s}",
            .{ repo, tag },
        );

        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("pull failed status={d} image={s} body={s}", .{
                response.status,
                image,
                response.body,
            });

            return error.DockerPullFailed;
        }

        if (std.mem.indexOf(u8, response.body, "\"error\"") != null) {
            log_docker.err("pull stream reported error image={s} body={s}", .{
                image,
                response.body,
            });

            return error.DockerPullFailed;
        }
    }

    /// Creates a named container and returns the Docker container id.
    pub fn createContainer(
        self: *const DockerApi,
        // The name of the container.
        container_name: []const u8,
        // The container image reference.
        image: []const u8,
        // The command to run in the container.
        command: []const []const u8,
        // The environment variables to set in the container.
        env_pairs: []const []const u8,
        // The port bindings to set in the container.
        port_bindings_json: []const u8,
        // The binds to set in the container.
        binds_json: []const u8,
        // Docker labels JSON object for platform metadata.
        labels_json: []const u8,
    ) ![]u8 {
        const path = try std.fmt.allocPrint(self.allocator, "/v1.44/containers/create?name={s}", .{container_name});
        defer self.allocator.free(path);

        const cmd_json = try stringArrayToJson(self.allocator, command);
        defer self.allocator.free(cmd_json);

        const env_json = try stringArrayToJson(self.allocator, env_pairs);
        defer self.allocator.free(env_json);

        const body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"Image\":\"{s}\",\"Cmd\":{s},\"Env\":{s},\"Labels\":{s},\"HostConfig\":{{\"PortBindings\":{s},\"Binds\":{s}}}}}",
            .{ image, cmd_json, env_json, labels_json, port_bindings_json, binds_json },
        );

        defer self.allocator.free(body);

        var response = try self.request("POST", path, body);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            if (response.status == 409) {
                log_docker.warn("create skipped existing container name={s}", .{container_name});
                return try self.allocator.dupe(u8, container_name);
            }

            log_docker.err("create failed status={d} name={s} body={s}", .{
                response.status,
                container_name,
                response.body,
            });

            return error.DockerCreateFailed;
        }

        return parseJsonStringField(self.allocator, response.body, "Id") catch |err| {
            log_docker.err("create response parse failed status={d} name={s} body={s}", .{
                response.status,
                container_name,
                response.body,
            });
            return err;
        };
    }

    /// Starts a container by name or id.
    pub fn startContainer(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/v1.44/containers/{s}/start", .{container_ref});
        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 304) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("start failed status={d} ref={s}", .{ response.status, container_ref });
            return error.DockerStartFailed;
        }
    }

    /// Stops a container by name or id.
    pub fn stopContainer(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/v1.44/containers/{s}/stop", .{container_ref});
        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 304) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("stop failed status={d} ref={s}", .{ response.status, container_ref });
            return error.DockerStopFailed;
        }
    }

    /// Removes a container by name or id.
    pub fn removeContainer(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
        // Whether to force the removal.
        force: bool,
    ) !void {
        const path = try std.fmt.allocPrint(
            self.allocator,
            "/v1.44/containers/{s}?force={s}",
            .{ container_ref, if (force) "true" else "false" },
        );

        defer self.allocator.free(path);

        var response = try self.request("DELETE", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 404) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("remove failed status={d} ref={s}", .{ response.status, container_ref });
            return error.DockerRemoveFailed;
        }
    }

    /// Ensures a Docker volume exists.
    pub fn ensureVolume(
        self: *const DockerApi,
        // The name of the volume to ensure.
        volume_name: []const u8,
    ) !void {
        const body = try std.fmt.allocPrint(self.allocator, "{{\"Name\":\"{s}\"}}", .{volume_name});
        defer self.allocator.free(body);

        var response = try self.request("POST", "/v1.44/volumes/create", body);
        defer response.deinit(self.allocator);

        if (response.status == 201 or response.status == 200) {
            return;
        }

        if (response.status == 409) {
            return;
        }

        log_docker.err("ensureVolume failed status={d} name={s}", .{ response.status, volume_name });
        return error.DockerVolumeFailed;
    }

    /// Removes a Docker volume by name.
    pub fn removeVolume(
        self: *const DockerApi,
        // The name of the volume to remove.
        volume_name: []const u8,
        // Whether to force removal when the volume is in use.
        force: bool,
    ) !void {
        const path = try std.fmt.allocPrint(
            self.allocator,
            "/v1.44/volumes/{s}?force={s}",
            .{ volume_name, if (force) "true" else "false" },
        );
        defer self.allocator.free(path);

        var response = try self.request("DELETE", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 404) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("removeVolume failed status={d} name={s}", .{ response.status, volume_name });
            return error.DockerVolumeRemoveFailed;
        }
    }

    /// Returns Docker Engine info JSON.
    pub fn getInfo(self: *const DockerApi) !DockerResponse {
        return self.request("GET", "/v1.44/info", null);
    }

    /// Returns Docker disk usage summary JSON.
    pub fn getSystemDf(self: *const DockerApi) !DockerResponse {
        return self.request("GET", "/v1.44/system/df", null);
    }

    /// Lists naulite-managed running containers with instance metadata.
    pub fn listManagedContainers(self: *const DockerApi) ![]ManagedContainer {
        var response = try self.request("GET", "/v1.44/containers/json", null);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            return error.DockerListFailed;
        }

        const parsed = try std.json.parseFromSlice(std.json.Value, self.allocator, response.body, .{});
        errdefer parsed.deinit();

        if (parsed.value != .array) {
            parsed.deinit();
            return &[_]ManagedContainer{};
        }

        var containers: std.ArrayList(ManagedContainer) = .empty;
        errdefer {
            for (containers.items) |container| {
                self.allocator.free(container.docker_id);
                self.allocator.free(container.instance_id);
                self.allocator.free(container.service_name);
            }
            containers.deinit(self.allocator);
        }

        for (parsed.value.array.items) |item| {
            if (item != .object) {
                continue;
            }

            const id_value = item.object.get("Id") orelse continue;
            const docker_id = switch (id_value) {
                .string => |s| s,
                else => continue,
            };

            const names_value = item.object.get("Names") orelse continue;
            if (names_value != .array or names_value.array.items.len == 0) {
                continue;
            }

            const first_name = names_value.array.items[0];
            const raw_name = switch (first_name) {
                .string => |s| s,
                else => continue,
            };

            const container_name = if (raw_name.len > 0 and raw_name[0] == '/')
                raw_name[1..]
            else
                raw_name;

            if (!isPlatformManagedContainer(container_name, item.object.get("Labels"))) {
                continue;
            }

            const labels = item.object.get("Labels");
            const instance_id = readLabelValue(labels, "naulite.instance.id") orelse container_name;
            const service_name = readLabelValue(labels, "naulite.service.name") orelse "-";

            try containers.append(self.allocator, .{
                .docker_id = try self.allocator.dupe(u8, docker_id),
                .instance_id = try self.allocator.dupe(u8, instance_id),
                .service_name = try self.allocator.dupe(u8, service_name),
            });
        }

        parsed.deinit();
        return try containers.toOwnedSlice(self.allocator);
    }

    /// Lists identifiers for running containers.
    pub fn listRunningContainerIds(self: *const DockerApi) ![]const []const u8 {
        var response = try self.request("GET", "/v1.44/containers/json", null);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            return error.DockerListFailed;
        }

        const parsed = try std.json.parseFromSlice(std.json.Value, self.allocator, response.body, .{});
        errdefer parsed.deinit();

        if (parsed.value != .array) {
            return &[_][]const u8{};
        }

        var ids: std.ArrayList([]const u8) = .empty;
        errdefer {
            for (ids.items) |container_id| {
                self.allocator.free(container_id);
            }
            ids.deinit(self.allocator);
        }

        for (parsed.value.array.items) |item| {
            if (item != .object) {
                continue;
            }
            const id_value = item.object.get("Id") orelse continue;
            const id_text = switch (id_value) {
                .string => |s| s,
                else => continue,
            };
            try ids.append(self.allocator, try self.allocator.dupe(u8, id_text));
        }

        parsed.deinit();
        return try ids.toOwnedSlice(self.allocator);
    }

    /// Returns one-shot stats JSON for a container.
    pub fn getContainerStats(
        self: *const DockerApi,
        // Container identifier.
        container_ref: []const u8,
    ) !DockerResponse {
        const path = try std.fmt.allocPrint(
            self.allocator,
            "/v1.44/containers/{s}/stats?stream=false",
            .{container_ref},
        );
        defer self.allocator.free(path);

        return self.request("GET", path, null);
    }

    /// Connects a container to a Docker network.
    pub fn connectNetwork(
        self: *const DockerApi,
        // Docker network name.
        network_name: []const u8,
        // Container name or id.
        container_ref: []const u8,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/v1.44/networks/{s}/connect", .{network_name});
        defer self.allocator.free(path);

        const body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"Container\":\"{s}\"}}",
            .{container_ref},
        );
        defer self.allocator.free(body);

        var response = try self.request("POST", path, body);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("connectNetwork failed status={d} network={s} container={s} body={s}",
                .{ response.status, network_name, container_ref, response.body },
            );
            return error.DockerNetworkConnectFailed;
        }
    }

    /// Disconnects a container from a Docker network.
    pub fn disconnectNetwork(
        self: *const DockerApi,
        // Docker network name.
        network_name: []const u8,
        // Container name or id.
        container_ref: []const u8,
        // Whether to force disconnect.
        force: bool,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/v1.44/networks/{s}/disconnect", .{network_name});
        defer self.allocator.free(path);

        const body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"Container\":\"{s}\",\"Force\":{s}}}",
            .{ container_ref, if (force) "true" else "false" },
        );
        defer self.allocator.free(body);

        var response = try self.request("POST", path, body);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            log_docker.err("disconnectNetwork failed status={d} network={s} container={s} body={s}",
                .{ response.status, network_name, container_ref, response.body },
            );
            return error.DockerNetworkDisconnectFailed;
        }
    }

    /// Executes a command inside a running container.
    pub fn execContainer(
        self: *const DockerApi,
        // Container name or id.
        container_ref: []const u8,
        // Command argv to run inside the container.
        command: []const []const u8,
    ) !ExecResult {
        const create_path = try std.fmt.allocPrint(self.allocator, "/v1.44/containers/{s}/exec", .{container_ref});
        defer self.allocator.free(create_path);

        const cmd_json = try stringArrayToJson(self.allocator, command);
        defer self.allocator.free(cmd_json);

        const create_body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"AttachStdout\":true,\"AttachStderr\":true,\"Cmd\":{s}}}",
            .{cmd_json},
        );
        defer self.allocator.free(create_body);

        var create_response = try self.request("POST", create_path, create_body);
        defer create_response.deinit(self.allocator);

        if (create_response.status < 200 or create_response.status >= 300) {
            log_docker.err("exec create failed status={d} ref={s} body={s}", .{
                create_response.status,
                container_ref,
                create_response.body,
            });
            return error.DockerExecFailed;
        }

        const exec_id = try parseJsonStringField(self.allocator, create_response.body, "Id");
        defer self.allocator.free(exec_id);

        const start_path = try std.fmt.allocPrint(self.allocator, "/v1.44/exec/{s}/start", .{exec_id});
        defer self.allocator.free(start_path);

        const start_body = "{\"Detach\":false,\"Tty\":false}";
        var start_response = try self.request("POST", start_path, start_body);
        defer start_response.deinit(self.allocator);

        if (start_response.status < 200 or start_response.status >= 300) {
            log_docker.err("exec start failed status={d} execId={s} body={s}", .{
                start_response.status,
                exec_id,
                start_response.body,
            });
            return error.DockerExecFailed;
        }

        const streams = try demuxDockerExecStream(self.allocator, start_response.body);
        defer {
            self.allocator.free(streams.stdout);
            self.allocator.free(streams.stderr);
        }

        const inspect_path = try std.fmt.allocPrint(self.allocator, "/v1.44/exec/{s}/json", .{exec_id});
        defer self.allocator.free(inspect_path);

        var inspect_response = try self.request("GET", inspect_path, null);
        defer inspect_response.deinit(self.allocator);

        if (inspect_response.status < 200 or inspect_response.status >= 300) {
            return error.DockerExecFailed;
        }

        const exit_code = parseJsonIntField(inspect_response.body, "ExitCode") orelse 1;

        return .{
            .exit_code = @intCast(exit_code),
            .stdout = try self.allocator.dupe(u8, streams.stdout),
            .stderr = try self.allocator.dupe(u8, streams.stderr),
        };
    }

    /// Creates a Docker exec instance and returns its identifier.
    pub fn createExecInstance(
        self: *const DockerApi,
        // Container name or id.
        container_ref: []const u8,
        // Command argv to run inside the container.
        command: []const []const u8,
        // Whether stdin is attached.
        attach_stdin: bool,
        // Whether stdout is attached.
        attach_stdout: bool,
        // Whether stderr is attached.
        attach_stderr: bool,
        // Whether a TTY is allocated.
        allocate_tty: bool,
    ) ![]u8 {
        const create_path = try std.fmt.allocPrint(self.allocator, "/v1.44/containers/{s}/exec", .{container_ref});
        defer self.allocator.free(create_path);

        const cmd_json = try stringArrayToJson(self.allocator, command);
        defer self.allocator.free(cmd_json);

        const create_body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"AttachStdin\":{s},\"AttachStdout\":{s},\"AttachStderr\":{s},\"Tty\":{s},\"Cmd\":{s}}}",
            .{
                if (attach_stdin) "true" else "false",
                if (attach_stdout) "true" else "false",
                if (attach_stderr) "true" else "false",
                if (allocate_tty) "true" else "false",
                cmd_json,
            },
        );
        defer self.allocator.free(create_body);

        var create_response = try self.request("POST", create_path, create_body);
        defer create_response.deinit(self.allocator);

        if (create_response.status < 200 or create_response.status >= 300) {
            log_docker.err("exec create failed status={d} ref={s} body={s}", .{
                create_response.status,
                container_ref,
                create_response.body,
            });
            return error.DockerExecFailed;
        }

        return try parseJsonStringField(self.allocator, create_response.body, "Id");
    }

    /// Starts an exec instance and returns the hijacked Docker stream.
    pub fn startExecHijack(
        self: *const DockerApi,
        // Docker exec identifier.
        exec_id: []const u8,
        // Whether the exec session uses a TTY.
        allocate_tty: bool,
    ) !std.Io.net.Stream {
        const io = blocking_io.io();

        const unix_address = try std.Io.net.UnixAddress.init(self.socket_path);
        var stream = try unix_address.connect(io);

        var write_buffer: [8192]u8 = undefined;
        var net_writer = stream.writer(io, &write_buffer);

        const start_path = try std.fmt.allocPrint(self.allocator, "/v1.44/exec/{s}/start", .{exec_id});
        defer self.allocator.free(start_path);

        const start_body = if (allocate_tty)
            "{\"Detach\":false,\"Tty\":true}"
        else
            "{\"Detach\":false,\"Tty\":false}";

        try std.Io.Writer.print(
            &net_writer.interface,
            "POST {s} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nConnection: Upgrade\r\nUpgrade: tcp\r\nContent-Length: {d}\r\n\r\n{s}",
            .{ start_path, start_body.len, start_body },
        );
        try std.Io.Writer.flush(&net_writer.interface);

        var response_buffer: std.ArrayList(u8) = .empty;
        defer response_buffer.deinit(self.allocator);

        var read_buffer: [4096]u8 = undefined;
        while (true) {
            var net_reader = stream.reader(io, &read_buffer);
            const read_count = std.Io.Reader.readSliceShort(&net_reader.interface, read_buffer[0..]) catch break;
            if (read_count == 0) {
                break;
            }
            try response_buffer.appendSlice(self.allocator, read_buffer[0..read_count]);
            if (std.mem.indexOf(u8, response_buffer.items, "\r\n\r\n") != null) {
                break;
            }
        }

        if (!std.mem.startsWith(u8, response_buffer.items, "HTTP/1.1 101")) {
            log_docker.err("exec hijack failed body={s}", .{response_buffer.items});
            stream.close(io);
            return error.DockerExecFailed;
        }

        return stream;
    }

    /// Reads the exit code for a finished exec instance.
    pub fn inspectExecExitCode(
        self: *const DockerApi,
        // Docker exec identifier.
        exec_id: []const u8,
    ) !u8 {
        const inspect_path = try std.fmt.allocPrint(self.allocator, "/v1.44/exec/{s}/json", .{exec_id});
        defer self.allocator.free(inspect_path);

        var inspect_response = try self.request("GET", inspect_path, null);
        defer inspect_response.deinit(self.allocator);

        if (inspect_response.status < 200 or inspect_response.status >= 300) {
            return error.DockerExecFailed;
        }

        const exit_code = parseJsonIntField(inspect_response.body, "ExitCode") orelse 1;
        return @intCast(exit_code);
    }

    /// Fetches container logs as plain text.
    pub fn containerLogs(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
        // The number of lines to fetch.
        tail: ?usize,
    ) ![]u8 {
        const tail_count = tail orelse 200;
        const path = try std.fmt.allocPrint(
            self.allocator,
            "/v1.44/containers/{s}/logs?stdout=true&stderr=true&tail={d}",
            .{ container_ref, tail_count },
        );

        defer self.allocator.free(path);

        var response = try self.request("GET", path, null);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            return error.DockerLogsFailed;
        }

        return try demuxDockerLogs(self.allocator, response.body);
    }

    /// Parses a HTTP response from a raw string.
    fn parseHttpResponse(
        allocator: std.mem.Allocator,
        // The raw HTTP response.
        raw: []const u8,
    ) !DockerResponse {
        const header_end = std.mem.indexOf(u8, raw, "\r\n\r\n") orelse return error.InvalidHttpResponse;
        const header_section = raw[0..header_end];
        const raw_body = raw[header_end + 4 ..];

        const status_line_end = std.mem.indexOfScalar(u8, header_section, '\n') orelse return error.InvalidHttpResponse;
        const status_line = std.mem.trim(u8, header_section[0..status_line_end], "\r");

        var status_parts = std.mem.tokenizeScalar(u8, status_line, ' ');
        _ = status_parts.next();
        const status_code_text = status_parts.next() orelse return error.InvalidHttpResponse;
        const status = try std.fmt.parseInt(u16, status_code_text, 10);

        const transfer_encoding = readHeaderValue(header_section, "Transfer-Encoding");
        const content_length_text = readHeaderValue(header_section, "Content-Length");

        const body = body_blk: {
            if (transfer_encoding) |encoding| {
                if (std.ascii.eqlIgnoreCase(encoding, "chunked")) {
                    const decoded = decodeChunkedBody(allocator, raw_body) catch |err| {
                        if (extractJsonPayload(raw_body)) |payload| {
                            break :body_blk try allocator.dupe(u8, payload);
                        }

                        return err;
                    };

                    if (decoded.len == 0) {
                        if (extractJsonPayload(raw_body)) |payload| {
                            break :body_blk try allocator.dupe(u8, payload);
                        }
                    }

                    break :body_blk decoded;
                }

                break :body_blk try allocator.dupe(u8, raw_body);
            }

            if (content_length_text) |length_text| {
                const content_length = try std.fmt.parseInt(usize, length_text, 10);
                const bounded = raw_body[0..@min(content_length, raw_body.len)];
                break :body_blk try allocator.dupe(u8, bounded);
            }

            if (extractJsonPayload(raw_body)) |payload| {
                break :body_blk try allocator.dupe(u8, payload);
            }

            break :body_blk try allocator.dupe(u8, raw_body);
        };

        return .{ .status = status, .body = body };
    }

    /// Returns a trimmed HTTP header value when present.
    fn readHeaderValue(
        // The HTTP header section.
        header_section: []const u8,
        // The header name to read.
        header_name: []const u8,
    ) ?[]const u8 {
        var lines = std.mem.splitScalar(u8, header_section, '\n');

        while (lines.next()) |line| {
            const trimmed = std.mem.trim(u8, line, "\r");

            if (trimmed.len == 0) {
                continue;
            }

            const colon = std.mem.indexOfScalar(u8, trimmed, ':') orelse continue;
            const name = std.mem.trim(u8, trimmed[0..colon], " ");

            if (!std.ascii.eqlIgnoreCase(name, header_name)) {
                continue;
            }

            return std.mem.trim(u8, trimmed[colon + 1 ..], " ");
        }

        return null;
    }

    /// Decodes an HTTP/1.1 chunked response body.
    fn decodeChunkedBody(
        // The allocator to use.
        allocator: std.mem.Allocator,
        // The chunked body bytes.
        raw_body: []const u8,
    ) ![]u8 {
        if (raw_body.len > 0 and (raw_body[0] == '{' or raw_body[0] == '[')) {
            return try allocator.dupe(u8, raw_body);
        }

        var decoded: std.ArrayList(u8) = .empty;
        errdefer decoded.deinit(allocator);

        var offset: usize = 0;

        while (offset < raw_body.len) {
            const line_end = findLineEnd(raw_body, offset) orelse break;
            const size_line = std.mem.trim(u8, raw_body[offset..line_end], " ");
            const size_text = if (std.mem.indexOfScalar(u8, size_line, ';')) |semicolon|
                size_line[0..semicolon]
            else
                size_line;

            if (size_text.len == 0) {
                break;
            }

            const chunk_size = try std.fmt.parseInt(usize, size_text, 16);

            offset = advancePastLine(raw_body, line_end);

            if (chunk_size == 0) {
                break;
            }

            if (offset + chunk_size > raw_body.len) {
                return error.InvalidHttpResponse;
            }

            try decoded.appendSlice(allocator, raw_body[offset .. offset + chunk_size]);
            offset = advancePastLine(raw_body, offset + chunk_size);
        }

        return try decoded.toOwnedSlice(allocator);
    }

    /// Returns the index of the next HTTP line ending starting at offset.
    fn findLineEnd(raw_body: []const u8, offset: usize) ?usize {
        if (std.mem.indexOfPos(u8, raw_body, offset, "\r\n")) |line_end| {
            return line_end;
        }

        return std.mem.indexOfPos(u8, raw_body, offset, "\n");
    }

    /// Returns the byte offset immediately after a line ending.
    fn advancePastLine(raw_body: []const u8, line_end: usize) usize {
        if (line_end + 1 < raw_body.len and raw_body[line_end] == '\r' and raw_body[line_end + 1] == '\n') {
            return line_end + 2;
        }

        if (line_end < raw_body.len and raw_body[line_end] == '\n') {
            return line_end + 1;
        }

        return line_end;
    }

    /// Returns a JSON-looking slice embedded in a chunked or partial HTTP body.
    fn extractJsonPayload(raw_body: []const u8) ?[]const u8 {
        const object_start = std.mem.indexOfScalar(u8, raw_body, '{') orelse
            std.mem.indexOfScalar(u8, raw_body, '[') orelse return null;
        const object_end = if (raw_body[object_start] == '[')
            std.mem.lastIndexOfScalar(u8, raw_body, ']')
        else
            std.mem.lastIndexOfScalar(u8, raw_body, '}');
        const end = object_end orelse return null;

        if (end < object_start) {
            return null;
        }

        return raw_body[object_start .. end + 1];
    }

    /// Converts a string array to a JSON array.
    fn stringArrayToJson(
        // The allocator to use.
        allocator: std.mem.Allocator,
        // The string array to convert.
        values: []const []const u8,
    ) ![]u8 {
        var list: std.ArrayList(u8) = .empty;

        defer list.deinit(allocator);
        try list.append(allocator, '[');

        for (values, 0..) |value, index| {
            if (index > 0) {
                try list.append(allocator, ',');
            }

            const encoded = try std.fmt.allocPrint(allocator, "\"{s}\"", .{value});
            defer allocator.free(encoded);
            try list.appendSlice(allocator, encoded);
        }

        try list.append(allocator, ']');

        return try list.toOwnedSlice(allocator);
    }

    /// Parses a signed integer field from a JSON object body.
    fn parseJsonIntField(body: []const u8, field_name: []const u8) ?i64 {
        const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return null;
        defer parsed.deinit();

        const root = parsed.value;
        if (root != .object) {
            return null;
        }

        const value = root.object.get(field_name) orelse return null;
        return switch (value) {
            .integer => |n| n,
            .float => |n| @intFromFloat(n),
            else => null,
        };
    }

    /// Demuxes Docker exec stdout and stderr streams.
    fn demuxDockerExecStream(
        allocator: std.mem.Allocator,
        payload: []const u8,
    ) !ExecStreamOutput {
        var stdout_list: std.ArrayList(u8) = .empty;
        errdefer stdout_list.deinit(allocator);
        var stderr_list: std.ArrayList(u8) = .empty;
        errdefer stderr_list.deinit(allocator);

        var index: usize = 0;
        while (index + 8 <= payload.len) {
            const stream_type = payload[index];
            const frame_size =
                (@as(usize, payload[index + 4]) << 24) |
                (@as(usize, payload[index + 5]) << 16) |
                (@as(usize, payload[index + 6]) << 8) |
                @as(usize, payload[index + 7]);

            index += 8;

            if (index + frame_size > payload.len) {
                break;
            }

            const frame = payload[index .. index + frame_size];
            index += frame_size;

            switch (stream_type) {
                1 => try stdout_list.appendSlice(allocator, frame),
                2 => try stderr_list.appendSlice(allocator, frame),
                else => {},
            }
        }

        if (stdout_list.items.len == 0 and stderr_list.items.len == 0 and payload.len > 0) {
            try stdout_list.appendSlice(allocator, payload);
        }

        return .{
            .stdout = try stdout_list.toOwnedSlice(allocator),
            .stderr = try stderr_list.toOwnedSlice(allocator),
        };
    }

    /// Parses a JSON string field from a response body.
    fn parseJsonStringField(
        // The allocator to use.
        allocator: std.mem.Allocator,
        // The response body.
        body: []const u8,
        // The name of the field to parse.
        field_name: []const u8,
    ) ![]u8 {
        const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
        defer parsed.deinit();

        const root = parsed.value;

        if (root != .object) {
            return error.InvalidDockerResponse;
        }

        const value = root.object.get(field_name) orelse return error.InvalidDockerResponse;
        return switch (value) {
            .string => |s| try allocator.dupe(u8, s),
            else => error.InvalidDockerResponse,
        };
    }

    /// Demuxes Docker logs into a single payload.
    fn demuxDockerLogs(
        // The allocator to use.
        allocator: std.mem.Allocator,
        // The Docker logs payload.
        payload: []const u8,
    ) ![]u8 {
        var output: std.ArrayList(u8) = .empty;
        errdefer output.deinit(allocator);

        var index: usize = 0;
        while (index + 8 <= payload.len) {
            const frame_size =
                (@as(usize, payload[index + 4]) << 24) |
                (@as(usize, payload[index + 5]) << 16) |
                (@as(usize, payload[index + 6]) << 8) |
                @as(usize, payload[index + 7]);

            index += 8;

            if (index + frame_size > payload.len) {
                break;
            }

            try output.appendSlice(allocator, payload[index .. index + frame_size]);
            index += frame_size;
        }

        if (output.items.len == 0 and payload.len > 0) {
            return try allocator.dupe(u8, payload);
        }

        return try output.toOwnedSlice(allocator);
    }

    /// Returns whether a container should be included in platform metrics.
    fn isPlatformManagedContainer(container_name: []const u8, labels: ?std.json.Value) bool {
        if (readLabelValue(labels, "naulite.managed")) |value| {
            return std.mem.eql(u8, value, "true");
        }

        if (std.mem.startsWith(u8, container_name, "naulite-")) {
            return false;
        }

        return container_name.len > 0;
    }

    /// Reads a string label from a Docker labels object.
    fn readLabelValue(labels: ?std.json.Value, key: []const u8) ?[]const u8 {
        const root = labels orelse return null;
        if (root != .object) {
            return null;
        }

        const value = root.object.get(key) orelse return null;
        return switch (value) {
            .string => |text| text,
            else => null,
        };
    }
};

/// Process output captured from a Docker exec session.
pub const ExecResult = struct {
    // Process exit code from the exec session.
    exit_code: i32,

    // Captured stdout text.
    stdout: []const u8,

    // Captured stderr text.
    stderr: []const u8,
};

const ExecStreamOutput = struct {
    stdout: []const u8,
    stderr: []const u8,
};
