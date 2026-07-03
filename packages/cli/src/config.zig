const std = @import("std");

/// Resolved control plane connection settings for the CLI.
pub const Config = struct {
    // Base URL of the control plane API.
    base_url: []const u8,

    // Optional bearer token for remote access.
    token: ?[]const u8,

    // Optional tenant slug for multi-tenant control planes.
    tenant_slug: ?[]const u8 = null,

    /// Releases owned configuration strings.
    pub fn deinit(
        self: Config,
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) void {
        allocator.free(self.base_url);
    }

    /// Trims a trailing slash from a URL string.
    pub fn trimTrailingSlashOwned(
        allocator: std.mem.Allocator,
        // URL string to normalize.
        value: []const u8,
    ) ![]const u8 {
        if (value.len == 0 or value[value.len - 1] != '/') {
            return try allocator.dupe(u8, value);
        }

        return try allocator.dupe(u8, value[0 .. value.len - 1]);
    }
};
