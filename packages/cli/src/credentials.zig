const std = @import("std");

const Io = std.Io;

/// Saved CLI credentials for remote control plane access.
pub const Credentials = struct {
    // API key secret.
    api_key: ?[]const u8 = null,

    // NetBird or remote control plane host.
    cp_host: ?[]const u8 = null,

    // Control plane HTTP port.
    cp_port: u16 = 8080,

    // Optional tenant slug for multi-tenant control planes.
    tenant_slug: ?[]const u8 = null,

    /// Releases owned credential strings.
    pub fn deinit(
        self: Credentials,
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) void {
        if (self.api_key) |value| {
            allocator.free(value);
        }
        if (self.cp_host) |value| {
            allocator.free(value);
        }
        if (self.tenant_slug) |value| {
            allocator.free(value);
        }
    }
};

/// Returns the default credentials file path for the current user.
pub fn credentialsPath(
    allocator: std.mem.Allocator,
    // Process environment map.
    environ_map: *const std.process.Environ.Map,
) ![]const u8 {
    const home = environ_map.get("USERPROFILE") orelse environ_map.get("HOME") orelse ".";
    return std.fs.path.join(allocator, &.{ home, ".naulite", "credentials.json" });
}

/// Loads saved CLI credentials when the file exists.
pub fn load(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: Io,
    // Process environment map.
    environ_map: *const std.process.Environ.Map,
) !?Credentials {
    const file_path = try credentialsPath(allocator, environ_map);
    defer allocator.free(file_path);

    const file = std.Io.Dir.cwd().openFile(io, file_path, .{}) catch return null;
    defer file.close(io);

    var file_reader = file.reader(io, &.{});
    const contents = try file_reader.interface.allocRemaining(allocator, .unlimited);
    defer allocator.free(contents);

    var parsed = try std.json.parseFromSlice(
        struct {
            apiKey: ?[]const u8 = null,
            cpHost: ?[]const u8 = null,
            cpPort: ?u16 = null,
            tenantSlug: ?[]const u8 = null,
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
        .tenant_slug = if (parsed.value.tenantSlug) |value| try allocator.dupe(u8, value) else null,
    };
}

/// Persists CLI credentials for remote control plane access.
pub fn save(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: Io,
    // Process environment map.
    environ_map: *const std.process.Environ.Map,
    // Credentials to persist.
    credentials: Credentials,
) !void {
    const file_path = try credentialsPath(allocator, environ_map);
    defer allocator.free(file_path);

    if (std.fs.path.dirname(file_path)) |parent| {
        try std.Io.Dir.cwd().createDirPath(io, parent);
    }

    const json_body = try std.json.Stringify.valueAlloc(allocator, .{
        .apiKey = credentials.api_key,
        .cpHost = credentials.cp_host,
        .cpPort = credentials.cp_port,
        .tenantSlug = credentials.tenant_slug,
    }, .{});
    defer allocator.free(json_body);

    var payload = try std.ArrayList(u8).initCapacity(allocator, json_body.len + 1);
    defer payload.deinit(allocator);
    try payload.appendSlice(allocator, json_body);
    try payload.append(allocator, '\n');

    var write_buffer: [4096]u8 = undefined;
    const file = try std.Io.Dir.cwd().createFile(io, file_path, .{ .truncate = true });
    defer file.close(io);

    var file_writer = file.writer(io, &write_buffer);
    try file_writer.interface.writeAll(payload.items);
    try file_writer.interface.flush();
}
