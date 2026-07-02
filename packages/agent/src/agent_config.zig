const std = @import("std");

const bootstrap = @import("bootstrap.zig");
const env_util = @import("env_util.zig");

/// Persisted agent identity and connectivity settings (local "env" snapshot).
pub const AgentConfig = struct {
    // Control plane base URL.
    cp_url: []const u8,

    // Node identifier assigned or confirmed by the control plane.
    node_id: []const u8,

    // Hostname reported to the control plane.
    hostname: []const u8,

    // Agent HTTP URL reachable by the control plane.
    agent_url: []const u8,

    // Agent build version string.
    agent_version: []const u8,

    // Agent HTTP listen port.
    agent_port: u16,

    // Docker socket path or Windows named pipe.
    docker_socket: []const u8,

    // Self-hosted NetBird management URL when enrolled.
    netbird_management_url: ?[]const u8,

    // NetBird setup key used during provisioning (optional).
    netbird_setup_key: ?[]const u8,

    // NetBird device identifier assigned after enrollment (optional).
    netbird_device_id: ?[]const u8,

    // Absolute path of the on-disk config file backing this state.
    config_path: []const u8,

    /// Releases owned strings.
    pub fn deinit(
        self: *AgentConfig,
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) void {
        allocator.free(self.cp_url);
        allocator.free(self.node_id);
        allocator.free(self.hostname);
        allocator.free(self.agent_url);
        allocator.free(self.agent_version);
        allocator.free(self.docker_socket);
        allocator.free(self.config_path);
        if (self.netbird_management_url) |value| {
            allocator.free(value);
        }
        if (self.netbird_setup_key) |value| {
            allocator.free(value);
        }
        if (self.netbird_device_id) |value| {
            allocator.free(value);
        }
    }
};

const PersistedConfig = struct {
    cpUrl: ?[]const u8 = null,
    nodeId: ?[]const u8 = null,
    hostname: ?[]const u8 = null,
    agentUrl: ?[]const u8 = null,
    agentVersion: ?[]const u8 = null,
    agentPort: ?u16 = null,
    dockerSocket: ?[]const u8 = null,
    netbirdManagementUrl: ?[]const u8 = null,
    netbirdSetupKey: ?[]const u8 = null,
    netbirdDeviceId: ?[]const u8 = null,
};

/// Resolves the agent config file path for the current host.
pub fn resolveConfigPath(
    allocator: std.mem.Allocator,
    // Detected operating system family.
    os: bootstrap.OsFamily,
) ![]const u8 {
    if (env_util.readEnvOptional(allocator, "PLATFORM_AGENT_CONFIG")) |override| {
        return override;
    }

    return switch (os) {
        .windows => blk: {
            const program_data = std.c.getenv("PROGRAMDATA") orelse "C:\\ProgramData";
            break :blk try std.fs.path.join(allocator, &.{ std.mem.span(program_data), "Platform", "agent.json" });
        },
        .linux, .macos, .unknown => try allocator.dupe(u8, "/var/lib/platform/agent.json"),
    };
}

/// Loads agent configuration from disk when present, then applies environment overrides.
pub fn load(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Detected operating system family.
    os: bootstrap.OsFamily,
) !AgentConfig {
    const config_path = try resolveConfigPath(allocator, os);
    errdefer allocator.free(config_path);

    var base = try loadDefaults(allocator, os, config_path);
    errdefer base.deinit(allocator);

    if (loadFromDisk(allocator, io, config_path, &base)) {
        std.log.debug("[agent-config] loaded path={s} nodeId={s}", .{ config_path, base.node_id });
    } else |_| {
        std.log.debug("[agent-config] no file at path={s} using defaults", .{config_path});
    }

    try applyEnvOverrides(allocator, os, &base);
    return base;
}

/// Persists the current agent configuration to disk.
pub fn save(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Configuration to write.
    config: *const AgentConfig,
) !void {
    const payload = PersistedConfig{
        .cpUrl = config.cp_url,
        .nodeId = config.node_id,
        .hostname = config.hostname,
        .agentUrl = config.agent_url,
        .agentVersion = config.agent_version,
        .agentPort = config.agent_port,
        .dockerSocket = config.docker_socket,
        .netbirdManagementUrl = config.netbird_management_url,
        .netbirdSetupKey = config.netbird_setup_key,
        .netbirdDeviceId = config.netbird_device_id,
    };

    const json_body = try std.json.Stringify.valueAlloc(allocator, payload, .{});
    defer allocator.free(json_body);

    var output: std.ArrayList(u8) = .empty;
    defer output.deinit(allocator);
    try output.appendSlice(allocator, json_body);
    try output.append(allocator, '\n');

    if (std.fs.path.dirname(config.config_path)) |parent| {
        std.Io.Dir.cwd().createDirPath(io, parent) catch |err| switch (err) {
            error.PathAlreadyExists => {},
            else => return err,
        };
    }

    var write_buffer: [4096]u8 = undefined;
    const file = try std.Io.Dir.cwd().createFile(io, config.config_path, .{ .truncate = true });
    defer file.close(io);

    var file_writer = file.writer(io, &write_buffer);
    try file_writer.interface.writeAll(output.items);
    try file_writer.interface.flush();

    std.log.info("[agent-config] saved path={s} nodeId={s}", .{ config.config_path, config.node_id });
}

fn loadDefaults(
    allocator: std.mem.Allocator,
    os: bootstrap.OsFamily,
    config_path: []const u8,
) !AgentConfig {
    const node_id = try allocator.dupe(u8, "agent-1");
    errdefer allocator.free(node_id);

    const hostname = try allocator.dupe(u8, node_id);
    errdefer allocator.free(hostname);

    const cp_url = try allocator.dupe(u8, "http://control-plane-1:8080");
    errdefer allocator.free(cp_url);

    const agent_port: u16 = 9470;
    const agent_url = try std.fmt.allocPrint(allocator, "http://{s}:{d}", .{ hostname, agent_port });
    errdefer allocator.free(agent_url);

    const agent_version = try allocator.dupe(u8, "zig-0.1.0");
    errdefer allocator.free(agent_version);

    const docker_socket = try allocator.dupe(u8, defaultDockerSocket(os));

    return .{
        .cp_url = cp_url,
        .node_id = node_id,
        .hostname = hostname,
        .agent_url = agent_url,
        .agent_version = agent_version,
        .agent_port = agent_port,
        .docker_socket = docker_socket,
        .netbird_management_url = null,
        .netbird_setup_key = null,
        .netbird_device_id = null,
        .config_path = try allocator.dupe(u8, config_path),
    };
}

fn loadFromDisk(
    allocator: std.mem.Allocator,
    io: std.Io,
    // Absolute config file path.
    config_path: []const u8,
    // Configuration to merge into.
    config: *AgentConfig,
) !void {
    var read_buffer: [8192]u8 = undefined;
    const file = std.Io.Dir.cwd().openFile(io, config_path, .{}) catch return error.MissingConfigFile;
    defer file.close(io);

    var file_reader = file.reader(io, &read_buffer);
    const contents = file_reader.interface.readAlloc(allocator, std.math.maxInt(usize)) catch return error.InvalidConfigFile;
    defer allocator.free(contents);

    if (contents.len == 0) {
        return error.InvalidConfigFile;
    }

    var parsed = try std.json.parseFromSlice(PersistedConfig, allocator, contents, .{});
    defer parsed.deinit();

    if (parsed.value.cpUrl) |value| {
        try replaceString(allocator, &config.cp_url, value);
    }
    if (parsed.value.nodeId) |value| {
        try replaceString(allocator, &config.node_id, value);
    }
    if (parsed.value.hostname) |value| {
        try replaceString(allocator, &config.hostname, value);
    }
    if (parsed.value.agentUrl) |value| {
        try replaceString(allocator, &config.agent_url, value);
    }
    if (parsed.value.agentVersion) |value| {
        try replaceString(allocator, &config.agent_version, value);
    }
    if (parsed.value.agentPort) |value| {
        config.agent_port = value;
    }
    if (parsed.value.dockerSocket) |value| {
        try replaceString(allocator, &config.docker_socket, value);
    }
    if (parsed.value.netbirdManagementUrl) |value| {
        try replaceOptionalString(allocator, &config.netbird_management_url, value);
    }
    if (parsed.value.netbirdSetupKey) |value| {
        try replaceOptionalString(allocator, &config.netbird_setup_key, value);
    }
    if (parsed.value.netbirdDeviceId) |value| {
        try replaceOptionalString(allocator, &config.netbird_device_id, value);
    }
}

fn applyEnvOverrides(
    allocator: std.mem.Allocator,
    os: bootstrap.OsFamily,
    config: *AgentConfig,
) !void {
    if (env_util.readEnvOptional(allocator, "PLATFORM_CP_URL")) |value| {
        try replaceString(allocator, &config.cp_url, value);
        allocator.free(value);
    }

    if (env_util.readEnvOptional(allocator, "NODE_ID")) |value| {
        try replaceString(allocator, &config.node_id, value);
        allocator.free(value);
    }

    if (env_util.readEnvOptional(allocator, "HOSTNAME")) |value| {
        try replaceString(allocator, &config.hostname, value);
        allocator.free(value);
    }

    if (env_util.readEnvOptional(allocator, "AGENT_VERSION")) |value| {
        try replaceString(allocator, &config.agent_version, value);
        allocator.free(value);
    }

    if (env_util.readEnvOptional(allocator, "AGENT_URL")) |value| {
        try replaceString(allocator, &config.agent_url, value);
        allocator.free(value);
    } else {
        const agent_port = env_util.readEnvU16("AGENT_PORT", config.agent_port);
        config.agent_port = agent_port;
        const rebuilt = try std.fmt.allocPrint(allocator, "http://{s}:{d}", .{ config.hostname, agent_port });
        try replaceString(allocator, &config.agent_url, rebuilt);
        allocator.free(rebuilt);
    }

    if (env_util.readEnvOptional(allocator, "AGENT_PORT")) |value| {
        config.agent_port = std.fmt.parseInt(u16, value, 10) catch config.agent_port;
        allocator.free(value);
    }

    if (env_util.readEnvOptional(allocator, "DOCKER_SOCKET")) |value| {
        try replaceString(allocator, &config.docker_socket, value);
        allocator.free(value);
    } else if (env_util.readEnvOptional(allocator, "PLATFORM_DOCKER_SOCKET")) |value| {
        try replaceString(allocator, &config.docker_socket, value);
        allocator.free(value);
    }

    const netbird_url = env_util.readEnvOptional(allocator, "NETBIRD_MANAGEMENT_URL") orelse
        env_util.readEnvOptional(allocator, "NETBIRD_API_URL");
    if (netbird_url) |value| {
        try replaceOptionalString(allocator, &config.netbird_management_url, value);
        allocator.free(value);
    }

    const setup_key = env_util.readEnvOptional(allocator, "NETBIRD_SETUP_KEY") orelse
        env_util.readEnvOptional(allocator, "PLATFORM_SETUP_KEY");
    if (setup_key) |value| {
        try replaceOptionalString(allocator, &config.netbird_setup_key, value);
        allocator.free(value);
    }

    _ = os;
}

fn replaceString(
    allocator: std.mem.Allocator,
    target: *[]const u8,
    value: []const u8,
) !void {
    allocator.free(target.*);
    target.* = try allocator.dupe(u8, value);
}

fn replaceOptionalString(
    allocator: std.mem.Allocator,
    target: *?[]const u8,
    value: []const u8,
) !void {
    if (target.*) |existing| {
        allocator.free(existing);
    }
    target.* = try allocator.dupe(u8, value);
}

fn defaultDockerSocket(os: bootstrap.OsFamily) []const u8 {
    return switch (os) {
        .windows => "//./pipe/docker_engine",
        else => "/var/run/docker.sock",
    };
}

/// Applies fields returned by the control plane after node registration.
pub fn applyRegistrationResponse(
    allocator: std.mem.Allocator,
    // Configuration to update.
    config: *AgentConfig,
    // Raw JSON response body from POST /nodes/register.
    response_body: []const u8,
) !void {
    const parsed = try std.json.parseFromSlice(
        struct {
            id: []const u8,
            hostname: []const u8,
            agentUrl: ?[]const u8 = null,
            agentVersion: ?[]const u8 = null,
            netbirdDeviceId: ?[]const u8 = null,
        },
        allocator,
        response_body,
        .{},
    );
    defer parsed.deinit();

    try replaceString(allocator, &config.node_id, parsed.value.id);
    try replaceString(allocator, &config.hostname, parsed.value.hostname);

    if (parsed.value.agentUrl) |agent_url| {
        try replaceString(allocator, &config.agent_url, agent_url);
    }

    if (parsed.value.agentVersion) |agent_version| {
        try replaceString(allocator, &config.agent_version, agent_version);
    }

    if (parsed.value.netbirdDeviceId) |device_id| {
        try replaceOptionalString(allocator, &config.netbird_device_id, device_id);
    }

    std.log.debug(
        "[agent-config] registration applied nodeId={s} hostname={s}",
        .{ config.node_id, config.hostname },
    );
}
