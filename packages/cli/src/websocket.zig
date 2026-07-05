const std = @import("std");

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

/// Connected WebSocket client.
pub const Connection = struct {
    allocator: std.mem.Allocator,
    io: std.Io,
    stream: std.Io.net.Stream,
    read_buffer: []u8,

    /// Opens a WebSocket connection to the control plane exec endpoint.
    pub fn connect(
        allocator: std.mem.Allocator,
        // Process I/O handle.
        io: std.Io,
        // ws:// or wss:// URL.
        url: []const u8,
        // Optional bearer token.
        token: ?[]const u8,
        // Optional tenant slug header.
        tenant_slug: ?[]const u8,
    ) !Connection {
        const uri = try std.Uri.parse(url);
        const host_component = uri.host orelse return error.InvalidWebSocketUrl;
        const host = componentBytes(host_component);
        const port: u16 = uri.port orelse if (std.mem.eql(u8, uri.scheme, "wss")) 443 else 80;
        const path = pathForRequest(uri.path);

        const address = try resolveAddress(io, host, port);
        var stream = try std.Io.net.IpAddress.connect(&address, io, .{ .mode = .stream });

        var key_bytes: [16]u8 = undefined;
        io.random(&key_bytes);
        const sec_key = try encodeBase64Alloc(allocator, &key_bytes);
        defer allocator.free(sec_key);

        const path_with_query = if (uri.query) |query_component| blk: {
            const query = componentBytes(query_component);
            break :blk try std.fmt.allocPrint(allocator, "{s}?{s}", .{ path, query });
        } else try allocator.dupe(u8, path);
        defer allocator.free(path_with_query);

        const auth_header = if (token) |value|
            try std.fmt.allocPrint(allocator, "Authorization: Bearer {s}\r\n", .{value})
        else
            try allocator.dupe(u8, "");
        defer allocator.free(auth_header);

        const tenant_header = if (tenant_slug) |value|
            try std.fmt.allocPrint(allocator, "X-Naulite-Tenant: {s}\r\n", .{value})
        else
            try allocator.dupe(u8, "");
        defer allocator.free(tenant_header);

        const request = try std.fmt.allocPrint(
            allocator,
            "GET {s} HTTP/1.1\r\nHost: {s}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {s}\r\n{s}{s}\r\n",
            .{ path_with_query, host, sec_key, auth_header, tenant_header },
        );
        defer allocator.free(request);

        try writeAll(io, &stream, request);

        var response_buffer: [8192]u8 = undefined;
        const response_len = try readHttpHeaders(io, &stream, response_buffer[0..]);

        if (!std.mem.startsWith(u8, response_buffer[0..response_len], "HTTP/1.1 101")) {
            return error.WebSocketHandshakeFailed;
        }

        const read_buffer = try allocator.alloc(u8, 65536);

        return .{
            .allocator = allocator,
            .io = io,
            .stream = stream,
            .read_buffer = read_buffer,
        };
    }

    /// Sends a text WebSocket frame.
    pub fn sendText(
        self: *Connection,
        allocator: std.mem.Allocator,
        payload: []const u8,
    ) !void {
        _ = allocator;
        try sendFrame(self.io, &self.stream, .text, payload);
    }

    /// Sends a binary WebSocket frame.
    pub fn sendBinary(
        self: *Connection,
        payload: []const u8,
    ) !void {
        try sendFrame(self.io, &self.stream, .binary, payload);
    }

    /// Reads the next WebSocket frame.
    pub fn readFrame(
        self: *Connection,
        allocator: std.mem.Allocator,
        scratch: []u8,
    ) !Frame {
        _ = allocator;
        return readFrameFromStream(self.io, &self.stream, scratch);
    }

    /// Closes the WebSocket connection.
    pub fn close(self: *Connection, io: std.Io) void {
        self.allocator.free(self.read_buffer);
        self.stream.close(io);
    }
};

fn resolveAddress(io: std.Io, host: []const u8, port: u16) !std.Io.net.IpAddress {
    if (std.Io.net.IpAddress.parseIp4(host, port)) |address| {
        return address;
    } else |_| {}

    return std.Io.net.IpAddress.resolve(io, host, port);
}

fn writeAll(io: std.Io, stream: *std.Io.net.Stream, bytes: []const u8) !void {
    var write_buffer: [8192]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);
    try net_writer.interface.writeAll(bytes);
    try net_writer.interface.flush();
}

fn readHttpHeaders(io: std.Io, stream: *std.Io.net.Stream, buffer: []u8) !usize {
    var received: usize = 0;

    while (received < buffer.len) {
        var read_buffer: [1024]u8 = undefined;
        var net_reader = stream.reader(io, &read_buffer);
        const count = try std.Io.Reader.readSliceShort(&net_reader.interface, read_buffer[0..]);
        if (count == 0) {
            return error.EndOfStream;
        }

        @memcpy(buffer[received .. received + count], read_buffer[0..count]);
        received += count;

        if (std.mem.indexOf(u8, buffer[0..received], "\r\n\r\n")) |header_end| {
            return header_end + 4;
        }
    }

    return error.HttpHeadersTooLarge;
}

fn sendFrame(io: std.Io, stream: *std.Io.net.Stream, opcode: Opcode, payload: []const u8) !void {
    var header: [10]u8 = undefined;
    var header_len: usize = 2;
    header[0] = @as(u8, 0x80) | @intFromEnum(opcode);
    header[1] = 0x80;

    if (payload.len <= 125) {
        header[1] |= @intCast(payload.len);
    } else if (payload.len <= 65535) {
        header[1] |= 126;
        header[2] = @intCast((payload.len >> 8) & 0xff);
        header[3] = @intCast(payload.len & 0xff);
        header_len = 4;
    } else {
        return error.PayloadTooLarge;
    }

    var mask_key: [4]u8 = undefined;
    io.random(&mask_key);

    header[header_len] = mask_key[0];
    header[header_len + 1] = mask_key[1];
    header[header_len + 2] = mask_key[2];
    header[header_len + 3] = mask_key[3];
    header_len += 4;

    var masked = try std.heap.page_allocator.alloc(u8, payload.len);
    defer std.heap.page_allocator.free(masked);

    for (payload, 0..) |byte, index| {
        masked[index] = byte ^ mask_key[index % 4];
    }

    var write_buffer: [8192]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);
    try net_writer.interface.writeAll(header[0..header_len]);
    try net_writer.interface.writeAll(masked);
    try net_writer.interface.flush();
}

fn readFrameFromStream(io: std.Io, stream: *std.Io.net.Stream, scratch: []u8) !Frame {
    var read_buffer: [4096]u8 = undefined;
    var net_reader = stream.reader(io, &read_buffer);

    var header: [2]u8 = undefined;
    try readExact(&net_reader.interface, &header);

    const fin = (header[0] & 0x80) != 0;
    _ = fin;
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

fn componentBytes(component: std.Uri.Component) []const u8 {
    return switch (component) {
        .raw => |value| value,
        .percent_encoded => |value| value,
    };
}

fn pathForRequest(path_component: std.Uri.Component) []const u8 {
    const path = componentBytes(path_component);
    if (path.len == 0) {
        return "/";
    }
    return path;
}
