const std = @import("std");

const agent_config = @import("agent_config.zig");
const process_cmd = @import("process_cmd.zig");

pub const LoadError = error{
    MissingManagementUrl,
    MissingSetupKey,
    CloudEndpointNotAllowed,
    InvalidManagementUrl,
    EnrollmentFailed,
};

/// Parsed NetBird status payload.
pub const StatusInfo = struct {
    // Whether the NetBird client reports a connected management session.
    connected: bool,

    // NetBird device identifier when available.
    device_id: ?[]const u8,

    /// Releases owned device identifier memory.
    pub fn deinit(self: *StatusInfo, allocator: std.mem.Allocator) void {
        if (self.device_id) |value| {
            allocator.free(value);
            self.device_id = null;
        }
    }
};

/// NetBird mesh client bound to a self-hosted management endpoint.
pub const NetbirdClient = struct {
    // The allocator to use.
    allocator: std.mem.Allocator,

    // Normalized self-hosted management URL.
    management_url: []const u8,

    // Setup key used for first-time enrollment.
    setup_key: ?[]const u8,

    // Last known device identifier parsed from status output.
    device_id: ?[]const u8,

    /// Creates a NetBird client for a self-hosted management endpoint.
    pub fn init(
        allocator: std.mem.Allocator,
        // Self-hosted NetBird management URL.
        management_url: []const u8,
        // Optional setup key for enrollment.
        setup_key: ?[]const u8,
    ) !NetbirdClient {
        if (isCloudEndpoint(management_url)) {
            return error.CloudEndpointNotAllowed;
        }

        const normalized = normalizeManagementUrl(allocator, management_url) catch {
            return error.InvalidManagementUrl;
        };
        errdefer allocator.free(normalized);

        var owned_setup_key: ?[]const u8 = null;
        if (setup_key) |value| {
            owned_setup_key = try allocator.dupe(u8, value);
        }

        return .{
            .allocator = allocator,
            .management_url = normalized,
            .setup_key = owned_setup_key,
            .device_id = null,
        };
    }

    /// Releases owned management URL memory.
    pub fn deinit(self: *NetbirdClient) void {
        self.allocator.free(self.management_url);
        if (self.setup_key) |value| {
            self.allocator.free(value);
        }
        if (self.device_id) |value| {
            self.allocator.free(value);
        }
    }

    /// Loads NetBird settings from persisted agent config, then environment variables.
    pub fn loadFromAgentConfig(
        // The allocator to use.
        allocator: std.mem.Allocator,
        // Loaded agent configuration.
        config: *const agent_config.AgentConfig,
    ) !NetbirdClient {
        if (config.netbird_management_url) |persisted| {
            return try init(allocator, persisted, config.netbird_setup_key);
        }

        return try loadFromEnv(allocator);
    }

    /// Loads NetBird settings from environment variables.
    pub fn loadFromEnv(
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) !NetbirdClient {
        const raw_ptr = std.c.getenv("NETBIRD_MANAGEMENT_URL") orelse std.c.getenv("NETBIRD_API_URL") orelse {
            std.log.err("[netbird] NETBIRD_MANAGEMENT_URL is required (self-hosted only)", .{});
            return error.MissingManagementUrl;
        };
        const raw = std.mem.span(raw_ptr);

        const setup_key = readOptionalEnv(allocator, "NETBIRD_SETUP_KEY") catch null;
        errdefer if (setup_key) |value| allocator.free(value);

        return init(allocator, raw, setup_key);
    }

    /// Returns whether the NetBird mesh is connected.
    pub fn isConnected(self: *NetbirdClient) bool {
        var status = readStatus(self.allocator) catch {
            std.log.debug("[netbird] connected check management_url={s} status=unavailable", .{self.management_url});
            return false;
        };
        defer status.deinit(self.allocator);

        if (status.device_id) |device_id| {
            self.setDeviceId(device_id) catch {};
        }

        std.log.debug(
            "[netbird] connected check management_url={s} connected={} device_id={s}",
            .{ self.management_url, status.connected, status.device_id orelse "-" },
        );
        return status.connected;
    }

    /// Returns the last known NetBird device identifier.
    pub fn getDeviceId(self: *const NetbirdClient) ?[]const u8 {
        return self.device_id;
    }

    /// Ensures the node is enrolled in the self-hosted NetBird mesh.
    pub fn ensureConnected(self: *NetbirdClient) !void {
        if (self.isConnected()) {
            std.log.debug("[netbird] already connected management_url={s}", .{self.management_url});
            return;
        }

        const setup_key = self.setup_key orelse blk: {
            const env_key = readOptionalEnv(self.allocator, "NETBIRD_SETUP_KEY") catch null;
            if (env_key) |value| {
                self.setup_key = value;
            }
            break :blk self.setup_key;
        };

        const key = setup_key orelse {
            std.log.warn("[netbird] enrollment skipped: missing setup key", .{});
            return error.MissingSetupKey;
        };

        std.log.info("[netbird] enrolling management_url={s}", .{self.management_url});
        try runNetbirdUp(self.allocator, self.management_url, key);

        if (!self.isConnected()) {
            std.log.err("[netbird] enrollment finished but client is still disconnected", .{});
            return error.EnrollmentFailed;
        }

        std.log.info(
            "[netbird] enrollment complete device_id={s}",
            .{self.device_id orelse "-"},
        );
    }

    /// Replaces the cached device identifier.
    fn setDeviceId(self: *NetbirdClient, device_id: []const u8) !void {
        if (self.device_id) |existing| {
            if (std.mem.eql(u8, existing, device_id)) {
                return;
            }
            self.allocator.free(existing);
        }

        self.device_id = try self.allocator.dupe(u8, device_id);
    }
};

/// Returns whether the URL points to NetBird cloud instead of self-hosted.
pub fn isCloudEndpoint(
    // URL to inspect.
    url: []const u8,
) bool {
    const cloud_markers = [_][]const u8{
        "api.netbird.io",
        "app.netbird.io",
        "netbird.io/",
        "://netbird.io",
    };

    for (cloud_markers) |marker| {
        if (std.mem.indexOf(u8, url, marker) != null) {
            return true;
        }
    }

    if (std.mem.endsWith(u8, url, "netbird.io")) {
        return true;
    }

    return false;
}

fn normalizeManagementUrl(allocator: std.mem.Allocator, raw: []const u8) ![]const u8 {
    var trimmed = std.mem.trim(u8, raw, " \t\r\n");
    while (trimmed.len > 0 and trimmed[trimmed.len - 1] == '/') {
        trimmed = trimmed[0 .. trimmed.len - 1];
    }

    if (std.mem.endsWith(u8, trimmed, "/api")) {
        trimmed = trimmed[0 .. trimmed.len - "/api".len];
        while (trimmed.len > 0 and trimmed[trimmed.len - 1] == '/') {
            trimmed = trimmed[0 .. trimmed.len - 1];
        }
    }

    if (trimmed.len == 0) {
        return error.InvalidManagementUrl;
    }

    return try allocator.dupe(u8, trimmed);
}

fn readOptionalEnv(allocator: std.mem.Allocator, key: []const u8) !?[]const u8 {
    const key_z = try allocator.allocSentinel(u8, key.len, 0);
    defer allocator.free(key_z);
    @memcpy(key_z, key);

    const value = std.c.getenv(key_z) orelse return null;
    return try allocator.dupe(u8, std.mem.span(value));
}

fn readStatus(allocator: std.mem.Allocator) !StatusInfo {
    if (try readOptionalEnv(allocator, "NETBIRD_STATUS_JSON")) |raw_json| {
        defer allocator.free(raw_json);
        return parseStatusJson(allocator, raw_json);
    }

    const output = process_cmd.runCommand(allocator, &.{ "netbird", "status", "--json" }) catch {
        const text_output = process_cmd.runCommand(allocator, &.{ "netbird", "status" }) catch {
            return StatusInfo{ .connected = false, .device_id = null };
        };
        defer allocator.free(text_output);
        return parseStatusText(allocator, text_output);
    };
    defer allocator.free(output);

    return parseStatusJson(allocator, output);
}

fn parseStatusJson(allocator: std.mem.Allocator, raw_json: []const u8) !StatusInfo {
    const parsed = try std.json.parseFromSlice(
        struct {
            management_connected: ?bool = null,
            connected: ?bool = null,
            id: ?[]const u8 = null,
            device_id: ?[]const u8 = null,
        },
        allocator,
        raw_json,
        .{},
    );
    defer parsed.deinit();

    const connected = parsed.value.management_connected orelse parsed.value.connected orelse false;
    const device_id = parsed.value.id orelse parsed.value.device_id;

    return .{
        .connected = connected,
        .device_id = if (device_id) |value| try allocator.dupe(u8, value) else null,
    };
}

fn parseStatusText(allocator: std.mem.Allocator, raw_text: []const u8) !StatusInfo {
    const connected = std.ascii.findIgnoreCase(raw_text, "management: connected") != null
        or std.ascii.findIgnoreCase(raw_text, "status: connected") != null;

    var device_id: ?[]const u8 = null;
    var lines = std.mem.splitScalar(u8, raw_text, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (std.mem.startsWith(u8, trimmed, "NetBird IP:")) {
            continue;
        }
        if (std.mem.indexOf(u8, trimmed, "ID:")) |index| {
            const value = std.mem.trim(u8, trimmed[index + "ID:".len ..], " \t\r");
            if (value.len > 0) {
                device_id = try allocator.dupe(u8, value);
            }
        }
    }

    return .{
        .connected = connected,
        .device_id = device_id,
    };
}

fn runNetbirdUp(
    allocator: std.mem.Allocator,
    management_url: []const u8,
    setup_key: []const u8,
) !void {
    const argv = [_][]const u8{
        "netbird",
        "up",
        "--management-url",
        management_url,
        "--setup-key",
        setup_key,
    };

    const output = try process_cmd.runCommand(allocator, &argv);
    defer allocator.free(output);

    std.log.debug("[netbird] netbird up output_len={d}", .{output.len});
}

fn runCommand(allocator: std.mem.Allocator, argv: []const []const u8) ![]u8 {
    return process_cmd.runCommand(allocator, argv) catch |err| switch (err) {
        error.CommandFailed => error.EnrollmentFailed,
        else => |other| other,
    };
}

test "rejects NetBird cloud endpoints" {
    try std.testing.expect(isCloudEndpoint("https://api.netbird.io"));
    try std.testing.expect(isCloudEndpoint("https://app.netbird.io"));
    try std.testing.expect(!isCloudEndpoint("https://vpn.example.com"));
}

test "normalizes management URL by stripping /api suffix" {
    const allocator = std.testing.allocator;
    const normalized = try normalizeManagementUrl(allocator, "https://vpn.example.com/api/");
    defer allocator.free(normalized);
    try std.testing.expectEqualStrings("https://vpn.example.com", normalized);
}

test "parses connected status from JSON payload" {
    const allocator = std.testing.allocator;
    const status = try parseStatusJson(
        allocator,
        "{\"management_connected\":true,\"id\":\"device-123\"}",
    );
    defer {
        if (status.device_id) |device_id| {
            allocator.free(device_id);
        }
    }

    try std.testing.expect(status.connected);
    try std.testing.expectEqualStrings("device-123", status.device_id.?);
}

test "parses connected status from text output" {
    const allocator = std.testing.allocator;
    const status = try parseStatusText(
        allocator,
        "Management: Connected\nNetBird IP: 100.64.0.2\nID: device-abc\n",
    );
    defer {
        if (status.device_id) |device_id| {
            allocator.free(device_id);
        }
    }

    try std.testing.expect(status.connected);
    try std.testing.expectEqualStrings("device-abc", status.device_id.?);
}
