const std = @import("std");

const crypto = std.crypto;

/// WebSocket frame opcode.
pub const Opcode = enum(u4) {
    continuation = 0x0,
    text = 0x1,
    binary = 0x2,
    close = 0x8,
    ping = 0x9,
    pong = 0xA,
};

/// Parsed WebSocket frame.
pub const Frame = struct {
    opcode: Opcode,
    payload: []const u8,
};

/// Server-side WebSocket session over an accepted TCP stream.
pub const ServerSession = struct {
    allocator: std.mem.Allocator,
    io: std.Io,
    stream: *std.Io.net.Stream,

    /// Completes the WebSocket handshake from raw HTTP headers.
    pub fn accept(
        allocator: std.mem.Allocator,
        io: std.Io,
        stream: *std.Io.net.Stream,
        header_section: []const u8,
    ) !ServerSession {
        const sec_key = parseHeaderValue(header_section, "Sec-WebSocket-Key") orelse return error.MissingWebSocketKey;

        var accept_input: [64]u8 = undefined;
        const accept_prefix = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
        const input_len = sec_key.len + accept_prefix.len;
        @memcpy(accept_input[0..sec_key.len], sec_key);
        @memcpy(accept_input[sec_key.len..input_len], accept_prefix);

        var digest: [20]u8 = undefined;
        crypto.hash.Sha1.hash(accept_input[0..input_len], &digest, .{});

        const accept_key = try encodeBase64Alloc(allocator, &digest);
        defer allocator.free(accept_key);

        const response = try std.fmt.allocPrint(
            allocator,
            "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: {s}\r\n\r\n",
            .{accept_key},
        );
        defer allocator.free(response);

        try writeAll(io, stream, response);

        return .{
            .allocator = allocator,
            .io = io,
            .stream = stream,
        };
    }

    /// Sends a text WebSocket frame.
    pub fn sendText(self: *ServerSession, payload: []const u8) !void {
        try sendFrame(self.io, self.stream, .text, payload, false);
    }

    /// Sends a binary WebSocket frame.
    pub fn sendBinary(self: *ServerSession, payload: []const u8) !void {
        try sendFrame(self.io, self.stream, .binary, payload, false);
    }

    /// Sends a pong frame in response to a ping.
    pub fn sendFramePong(self: *ServerSession, payload: []const u8) !void {
        try sendFrame(self.io, self.stream, .pong, payload, false);
    }

    /// Reads the next WebSocket frame into scratch memory.
    pub fn readFrame(self: *ServerSession, scratch: []u8) !Frame {
        return readFrameFromStream(self.io, self.stream, scratch);
    }
};

fn parseHeaderValue(header_section: []const u8, header_name: []const u8) ?[]const u8 {
    var lines = std.mem.splitSequence(u8, header_section, "\r\n");
    _ = lines.next();

    while (lines.next()) |line| {
        if (line.len == 0) {
            break;
        }

        if (std.mem.indexOfScalar(u8, line, ':')) |colon| {
            const name = std.mem.trim(u8, line[0..colon], " ");
            if (std.ascii.eqlIgnoreCase(name, header_name)) {
                return std.mem.trim(u8, line[colon + 1 ..], " ");
            }
        }
    }

    return null;
}

fn writeAll(io: std.Io, stream: *std.Io.net.Stream, bytes: []const u8) !void {
    var write_buffer: [8192]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);
    try net_writer.interface.writeAll(bytes);
    try net_writer.interface.flush();
}

fn sendFrame(
    io: std.Io,
    stream: *std.Io.net.Stream,
    opcode: Opcode,
    payload: []const u8,
    masked: bool,
) !void {
    var header: [10]u8 = undefined;
    var header_len: usize = 2;
    header[0] = @as(u8, 0x80) | @intFromEnum(opcode);

    if (payload.len <= 125) {
        header[1] = @intCast(payload.len);
    } else if (payload.len <= 65535) {
        header[1] = 126;
        header[2] = @intCast((payload.len >> 8) & 0xff);
        header[3] = @intCast(payload.len & 0xff);
        header_len = 4;
    } else {
        return error.PayloadTooLarge;
    }

    if (masked) {
        header[1] |= 0x80;
    }

    var write_buffer: [8192]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);
    try net_writer.interface.writeAll(header[0..header_len]);
    try net_writer.interface.writeAll(payload);
    try net_writer.interface.flush();
}

fn readFrameFromStream(io: std.Io, stream: *std.Io.net.Stream, scratch: []u8) !Frame {
    var read_buffer: [4096]u8 = undefined;
    var net_reader = stream.reader(io, &read_buffer);

    var header: [2]u8 = undefined;
    try readExact(&net_reader.interface, &header);

    const opcode: Opcode = @enumFromInt(header[0] & 0x0f);
    const masked = (header[1] & 0x80) != 0;
    var payload_len: usize = header[1] & 0x7f;

    if (payload_len == 126) {
        var extended: [2]u8 = undefined;
        try readExact(&net_reader.interface, &extended);
        payload_len = (@as(usize, extended[0]) << 8) | extended[1];
    } else if (payload_len == 127) {
        return error.UnsupportedFrameSize;
    }

    var mask_key: [4]u8 = undefined;
    if (masked) {
        try readExact(&net_reader.interface, &mask_key);
    }

    if (payload_len > scratch.len) {
        return error.PayloadTooLarge;
    }

    try readExactInto(&net_reader.interface, scratch[0..payload_len]);

    if (masked) {
        for (scratch[0..payload_len], 0..) |*byte, index| {
            byte.* ^= mask_key[index % 4];
        }
    }

    return .{
        .opcode = opcode,
        .payload = scratch[0..payload_len],
    };
}

fn readExact(reader: *std.Io.Reader, buffer: []u8) !void {
    var index: usize = 0;
    while (index < buffer.len) {
        const count = try reader.readSliceShort(buffer[index..]);
        if (count == 0) {
            return error.EndOfStream;
        }
        index += count;
    }
}

fn readExactInto(reader: *std.Io.Reader, buffer: []u8) !void {
    try readExact(reader, buffer);
}

fn encodeBase64Alloc(allocator: std.mem.Allocator, source: []const u8) ![]const u8 {
    const encoder = std.base64.standard.Encoder;
    const out_len = encoder.calcSize(source.len);
    const buffer = try allocator.alloc(u8, out_len);
    errdefer allocator.free(buffer);
    return encoder.encode(buffer, source);
}

test "websocket accept key hashing" {
    var digest: [20]u8 = undefined;
    const input = "dGhlIHNhbXBsZSBub25jZQ==258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    crypto.hash.Sha1.hash(input, &digest, .{});
    try std.testing.expect(digest[0] != 0);
}
