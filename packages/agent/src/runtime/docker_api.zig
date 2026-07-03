const std = @import("std");

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
        var threaded = std.Io.Threaded.init(self.allocator, .{});

        defer threaded.deinit();
        const io = threaded.io();

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
            var chunk = [_][]u8{read_buffer[0..]};

            const read_count = stream.read(io, &chunk) catch |err| switch (err) {
                error.ConnectionResetByPeer => break,
                else => return err,
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
            "/images/create?fromImage={s}&tag={s}",
            .{ repo, tag },
        );

        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] pull failed status={d} image={s} body={s}", .{
                response.status,
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
    ) ![]u8 {
        const path = try std.fmt.allocPrint(self.allocator, "/containers/create?name={s}", .{container_name});
        defer self.allocator.free(path);

        const cmd_json = try stringArrayToJson(self.allocator, command);
        defer self.allocator.free(cmd_json);

        const env_json = try stringArrayToJson(self.allocator, env_pairs);
        defer self.allocator.free(env_json);

        const body = try std.fmt.allocPrint(
            self.allocator,
            "{{\"Image\":\"{s}\",\"Cmd\":{s},\"Env\":{s},\"HostConfig\":{{\"PortBindings\":{s},\"Binds\":{s}}}}}",
            .{ image, cmd_json, env_json, port_bindings_json, binds_json },
        );

        defer self.allocator.free(body);

        var response = try self.request("POST", path, body);
        defer response.deinit(self.allocator);

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] create failed status={d} name={s} body={s}", .{
                response.status,
                container_name,
                response.body,
            });

            return error.DockerCreateFailed;
        }

        return try parseJsonStringField(self.allocator, response.body, "Id");
    }

    /// Starts a container by name or id.
    pub fn startContainer(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/containers/{s}/start", .{container_ref});
        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 304) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] start failed status={d} ref={s}", .{ response.status, container_ref });
            return error.DockerStartFailed;
        }
    }

    /// Stops a container by name or id.
    pub fn stopContainer(
        self: *const DockerApi,
        // The name or id of the container.
        container_ref: []const u8,
    ) !void {
        const path = try std.fmt.allocPrint(self.allocator, "/containers/{s}/stop", .{container_ref});
        defer self.allocator.free(path);

        var response = try self.request("POST", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 304) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] stop failed status={d} ref={s}", .{ response.status, container_ref });
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
            "/containers/{s}?force={s}",
            .{ container_ref, if (force) "true" else "false" },
        );

        defer self.allocator.free(path);

        var response = try self.request("DELETE", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 404) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] remove failed status={d} ref={s}", .{ response.status, container_ref });
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

        var response = try self.request("POST", "/volumes/create", body);
        defer response.deinit(self.allocator);

        if (response.status == 201 or response.status == 200) {
            return;
        }

        if (response.status == 409) {
            return;
        }

        std.log.err("[docker] ensureVolume failed status={d} name={s}", .{ response.status, volume_name });
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
            "/volumes/{s}?force={s}",
            .{ volume_name, if (force) "true" else "false" },
        );
        defer self.allocator.free(path);

        var response = try self.request("DELETE", path, null);
        defer response.deinit(self.allocator);

        if (response.status == 404) {
            return;
        }

        if (response.status < 200 or response.status >= 300) {
            std.log.err("[docker] removeVolume failed status={d} name={s}", .{ response.status, volume_name });
            return error.DockerVolumeRemoveFailed;
        }
    }

    /// Returns Docker Engine info JSON.
    pub fn getInfo(self: *const DockerApi) !DockerResponse {
        return self.request("GET", "/info", null);
    }

    /// Returns Docker disk usage summary JSON.
    pub fn getSystemDf(self: *const DockerApi) !DockerResponse {
        return self.request("GET", "/system/df", null);
    }

    /// Lists identifiers for running containers.
    pub fn listRunningContainerIds(self: *const DockerApi) ![]const []const u8 {
        var response = try self.request("GET", "/containers/json", null);
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
            "/containers/{s}/stats?stream=false",
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
        const path = try std.fmt.allocPrint(self.allocator, "/networks/{s}/connect", .{network_name});
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
            std.log.err(
                "[docker] connectNetwork failed status={d} network={s} container={s} body={s}",
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
        const path = try std.fmt.allocPrint(self.allocator, "/networks/{s}/disconnect", .{network_name});
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
            std.log.err(
                "[docker] disconnectNetwork failed status={d} network={s} container={s} body={s}",
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
        const create_path = try std.fmt.allocPrint(self.allocator, "/containers/{s}/exec", .{container_ref});
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
            std.log.err("[docker] exec create failed status={d} ref={s} body={s}", .{
                create_response.status,
                container_ref,
                create_response.body,
            });
            return error.DockerExecFailed;
        }

        const exec_id = try parseJsonStringField(self.allocator, create_response.body, "Id");
        defer self.allocator.free(exec_id);

        const start_path = try std.fmt.allocPrint(self.allocator, "/exec/{s}/start", .{exec_id});
        defer self.allocator.free(start_path);

        const start_body = "{\"Detach\":false,\"Tty\":false}";
        var start_response = try self.request("POST", start_path, start_body);
        defer start_response.deinit(self.allocator);

        if (start_response.status < 200 or start_response.status >= 300) {
            std.log.err("[docker] exec start failed status={d} execId={s} body={s}", .{
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

        const inspect_path = try std.fmt.allocPrint(self.allocator, "/exec/{s}/json", .{exec_id});
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
            "/containers/{s}/logs?stdout=true&stderr=true&tail={d}",
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

        const status_line_end = std.mem.indexOfScalar(u8, header_section, '\n') orelse return error.InvalidHttpResponse;
        const status_line = std.mem.trim(u8, header_section[0..status_line_end], "\r");

        var status_parts = std.mem.tokenizeScalar(u8, status_line, ' ');
        _ = status_parts.next();
        const status_code_text = status_parts.next() orelse return error.InvalidHttpResponse;
        const status = try std.fmt.parseInt(u16, status_code_text, 10);

        const body = try allocator.dupe(u8, raw[header_end + 4 ..]);
        return .{ .status = status, .body = body };
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
