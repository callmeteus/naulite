const std = @import("std");

pub const Config = struct {
    base_url: []const u8,
    token: ?[]const u8,

    /// Releases owned configuration strings.
    pub fn deinit(self: Config, allocator: std.mem.Allocator) void {
        allocator.free(self.base_url);
    }

    /// Trims a trailing slash from a URL string.
    pub fn trimTrailingSlashOwned(allocator: std.mem.Allocator, value: []const u8) ![]const u8 {
        if (value.len == 0 or value[value.len - 1] != '/') {
            return try allocator.dupe(u8, value);
        }

        return try allocator.dupe(u8, value[0 .. value.len - 1]);
    }
};
