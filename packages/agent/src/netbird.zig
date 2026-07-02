const std = @import("std");

pub const LoadError = error{
    MissingManagementUrl,
    CloudEndpointNotAllowed,
    InvalidManagementUrl,
};

pub const NetbirdClient = struct {
    allocator: std.mem.Allocator,
    management_url: []const u8,

    /// Creates a NetBird client for a self-hosted management endpoint.
    pub fn init(allocator: std.mem.Allocator, management_url: []const u8) !NetbirdClient {
        if (isCloudEndpoint(management_url)) {
            return error.CloudEndpointNotAllowed;
        }

        return .{
            .allocator = allocator,
            .management_url = try allocator.dupe(u8, management_url),
        };
    }

    /// Releases owned management URL memory.
    pub fn deinit(self: *NetbirdClient) void {
        self.allocator.free(self.management_url);
    }

    /// Loads NetBird settings from environment variables.
    pub fn loadFromEnv(allocator: std.mem.Allocator) LoadError!NetbirdClient {
        const raw = std.posix.getenv("NETBIRD_MANAGEMENT_URL") orelse std.posix.getenv("NETBIRD_API_URL") orelse {
            std.log.err("[netbird] NETBIRD_MANAGEMENT_URL is required (self-hosted only)", .{});
            return error.MissingManagementUrl;
        };

        if (isCloudEndpoint(raw)) {
            std.log.err("[netbird] NetBird cloud endpoints are not allowed; use self-hosted management URL", .{});
            return error.CloudEndpointNotAllowed;
        }

        const normalized = normalizeManagementUrl(allocator, raw) catch {
            return error.InvalidManagementUrl;
        };
        errdefer allocator.free(normalized);

        return .{
            .allocator = allocator,
            .management_url = normalized,
        };
    }

    /// Returns whether the NetBird mesh is connected (stub).
    pub fn isConnected(self: *const NetbirdClient) bool {
        std.log.debug("[netbird] connected check management_url={s}", .{self.management_url});
        _ = self;
        return false;
    }

    /// Ensures the node is enrolled in the self-hosted NetBird mesh (stub).
    pub fn ensureConnected(self: *NetbirdClient) !void {
        std.log.debug("[netbird] ensure connected management_url={s}", .{self.management_url});
    }
};

/// Returns whether the URL points to NetBird cloud instead of self-hosted.
pub fn isCloudEndpoint(url: []const u8) bool {
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
