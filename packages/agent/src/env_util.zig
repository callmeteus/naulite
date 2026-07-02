const std = @import("std");

/// Reads an environment variable or returns a duplicated default value.
pub fn readEnvOrDefault(
    allocator: std.mem.Allocator,
    // Environment variable name.
    key: []const u8,
    // Default value when the variable is unset.
    default_value: []const u8,
) ![]u8 {
    const key_z = try allocator.allocSentinel(u8, key.len, 0);
    defer allocator.free(key_z);
    @memcpy(key_z, key);

    if (std.c.getenv(key_z)) |value| {
        return try allocator.dupe(u8, std.mem.span(value));
    }

    return try allocator.dupe(u8, default_value);
}

/// Reads an environment variable when set, or null.
pub fn readEnvOptional(
    allocator: std.mem.Allocator,
    // Environment variable name.
    key: []const u8,
) ?[]u8 {
    const key_z = allocator.allocSentinel(u8, key.len, 0) catch return null;
    defer allocator.free(key_z);
    @memcpy(key_z, key);

    const value = std.c.getenv(key_z) orelse return null;
    return allocator.dupe(u8, std.mem.span(value)) catch null;
}

/// Reads an optional unsigned integer environment variable.
pub fn readEnvU16(
    // Environment variable name.
    key: []const u8,
    // Default value when the variable is unset or invalid.
    default_value: u16,
) u16 {
    var key_buffer: [256]u8 = undefined;
    if (key.len >= key_buffer.len) {
        return default_value;
    }
    @memcpy(key_buffer[0..key.len], key);
    key_buffer[key.len] = 0;

    const value = std.c.getenv(key_buffer[0..key.len :0]) orelse return default_value;
    return std.fmt.parseInt(u16, std.mem.span(value), 10) catch default_value;
}
