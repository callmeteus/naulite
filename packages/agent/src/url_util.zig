const std = @import("std");

const HEX_DIGITS = "0123456789ABCDEF";

/// Percent-encodes a single URL path segment.
pub fn encodePathSegment(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(allocator);

    for (value) |byte| {
        if (isUnencodedPathByte(byte)) {
            try output.append(allocator, byte);
            continue;
        }

        try output.append(allocator, '%');
        try output.append(allocator, HEX_DIGITS[byte >> 4]);
        try output.append(allocator, HEX_DIGITS[byte & 0x0f]);
    }

    return try output.toOwnedSlice(allocator);
}

fn isUnencodedPathByte(byte: u8) bool {
    return std.ascii.isAlphanumeric(byte) or byte == '-' or byte == '_' or byte == '.' or byte == '~';
}

test "encodePathSegment encodes instance identifiers" {
    const allocator = std.testing.allocator;
    const encoded = try encodePathSegment(allocator, "minimal:web-1");
    defer allocator.free(encoded);

    try std.testing.expectEqualStrings("minimal%3Aweb-1", encoded);
}
