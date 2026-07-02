const std = @import("std");

pub const Credentials = struct {
    api_key: ?[]const u8 = null,
    cp_host: ?[]const u8 = null,
    cp_port: u16 = 8080,

    /// Releases owned credential strings.
    pub fn deinit(self: Credentials, allocator: std.mem.Allocator) void {
        if (self.api_key) |value| {
            allocator.free(value);
        }
        if (self.cp_host) |value| {
            allocator.free(value);
        }
    }
};

/// Returns the default credentials file path for the current user.
pub fn credentialsPath(allocator: std.mem.Allocator) ![]const u8 {
    const home = std.posix.getenv("USERPROFILE") orelse std.posix.getenv("HOME") orelse ".";
    return std.fs.path.join(allocator, &.{ home, ".platform", "credentials.json" });
}

/// Loads saved CLI credentials when the file exists.
pub fn load(allocator: std.mem.Allocator) !?Credentials {
    const file_path = try credentialsPath(allocator);
    defer allocator.free(file_path);

    const file = std.fs.cwd().openFile(file_path, .{}) catch return null;
    defer file.close();

    const contents = try file.readToEndAlloc(allocator, 64 * 1024);
    defer allocator.free(contents);

    var parsed = try std.json.parseFromSlice(
        struct {
            apiKey: ?[]const u8 = null,
            cpHost: ?[]const u8 = null,
            cpPort: ?u16 = null,
        },
        allocator,
        contents,
        .{},
    );
    defer parsed.deinit();

    return Credentials{
        .api_key = if (parsed.value.apiKey) |value| try allocator.dupe(u8, value) else null,
        .cp_host = if (parsed.value.cpHost) |value| try allocator.dupe(u8, value) else null,
        .cp_port = parsed.value.cpPort orelse 8080,
    };
}

/// Persists CLI credentials for remote control plane access.
pub fn save(allocator: std.mem.Allocator, credentials: Credentials) !void {
    const file_path = try credentialsPath(allocator);
    defer allocator.free(file_path);

    if (std.fs.path.dirname(file_path)) |parent| {
        try std.fs.cwd().makePath(parent);
    }

    var body = std.ArrayList(u8).init(allocator);
    defer body.deinit();

    try std.json.stringify(.{
        .apiKey = credentials.api_key,
        .cpHost = credentials.cp_host,
        .cpPort = credentials.cp_port,
    }, .{}, body.writer());

    try body.append('\n');

    const file = try std.fs.cwd().createFile(file_path, .{ .truncate = true });
    defer file.close();
    try file.writeAll(body.items);
}
