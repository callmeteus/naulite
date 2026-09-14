const std = @import("std");
const builtin = @import("builtin");

const blocking_io = @import("../../blocking_io.zig");

/// OS-specific Docker Engine transport.
///
/// Windows named-pipe code lives in a comptime-only struct so Linux builds do
/// not analyze or link `kernel32` externs.
const platform = if (builtin.os.tag == .windows) struct {
    const windows = std.os.windows;
    const HANDLE = windows.HANDLE;
    const INVALID_HANDLE_VALUE = windows.INVALID_HANDLE_VALUE;

    const GENERIC_READ: windows.DWORD = 0x80000000;
    const GENERIC_WRITE: windows.DWORD = 0x40000000;
    const FILE_SHARE_READ: windows.DWORD = 0x00000001;
    const FILE_SHARE_WRITE: windows.DWORD = 0x00000002;
    const OPEN_EXISTING: windows.DWORD = 3;

    const kernel32 = struct {
        pub extern "kernel32" fn CreateFileW(
            lpFileName: [*:0]const u16,
            dwDesiredAccess: windows.DWORD,
            dwShareMode: windows.DWORD,
            lpSecurityAttributes: ?*anyopaque,
            dwCreationDisposition: windows.DWORD,
            dwFlagsAndAttributes: windows.DWORD,
            hTemplateFile: ?HANDLE,
        ) callconv(.c) HANDLE;

        pub extern "kernel32" fn ReadFile(
            hFile: HANDLE,
            lpBuffer: [*]u8,
            nNumberOfBytesToRead: windows.DWORD,
            lpNumberOfBytesRead: ?*windows.DWORD,
            lpOverlapped: ?*anyopaque,
        ) callconv(.c) windows.BOOL;

        pub extern "kernel32" fn WriteFile(
            hFile: HANDLE,
            lpBuffer: [*]const u8,
            nNumberOfBytesToWrite: windows.DWORD,
            lpNumberOfBytesWritten: ?*windows.DWORD,
            lpOverlapped: ?*anyopaque,
        ) callconv(.c) windows.BOOL;

        pub extern "kernel32" fn CloseHandle(hObject: HANDLE) callconv(.c) windows.BOOL;
    };

    /// Transport handle for Docker Engine HTTP over a Windows named pipe.
    pub const Connection = struct {
        handle: HANDLE,

        /// Closes the underlying transport handle.
        pub fn close(self: *Connection, io: std.Io) void {
            _ = io;
            _ = kernel32.CloseHandle(self.handle);
        }

        /// Writes the full HTTP request payload to Docker.
        pub fn writeAll(self: *const Connection, io: std.Io, data: []const u8) !void {
            _ = io;
            try pipeWriteAll(self.handle, data);
        }

        /// Reads up to `dest.len` bytes from Docker.
        pub fn read(self: *const Connection, io: std.Io, dest: []u8) !usize {
            _ = io;
            return try pipeRead(self.handle, dest);
        }
    };

    /// Opens a connection to the Docker Engine API endpoint.
    pub fn connect(allocator: std.mem.Allocator, socket_path: []const u8) !Connection {
        const pipe_path = try normalizeWindowsPipePath(allocator, socket_path);
        defer allocator.free(pipe_path);

        const path_utf16 = try std.unicode.utf8ToUtf16LeAllocZ(allocator, pipe_path);
        defer allocator.free(path_utf16);

        const handle = kernel32.CreateFileW(
            path_utf16.ptr,
            GENERIC_READ | GENERIC_WRITE,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            null,
            OPEN_EXISTING,
            0,
            null,
        );

        if (handle == INVALID_HANDLE_VALUE) {
            return error.DockerSocketUnavailable;
        }

        return .{ .handle = handle };
    }

    fn pipeWriteAll(handle: HANDLE, data: []const u8) !void {
        var offset: usize = 0;

        while (offset < data.len) {
            var written: windows.DWORD = 0;
            const chunk = data[offset..];
            const to_write: windows.DWORD = @intCast(@min(chunk.len, std.math.maxInt(windows.DWORD)));

            const ok = kernel32.WriteFile(
                handle,
                chunk.ptr,
                to_write,
                &written,
                null,
            );

            if (ok == .FALSE or written == 0) {
                return error.WriteFailed;
            }

            offset += written;
        }
    }

    fn pipeRead(handle: HANDLE, dest: []u8) !usize {
        var read_count: windows.DWORD = 0;

        const ok = kernel32.ReadFile(
            handle,
            dest.ptr,
            @intCast(dest.len),
            &read_count,
            null,
        );

        if (ok == .FALSE and read_count == 0) {
            return error.ReadFailed;
        }

        return read_count;
    }
} else struct {
    /// Transport handle for Docker Engine HTTP over a Unix socket.
    pub const Connection = struct {
        stream: std.Io.net.Stream,

        /// Closes the underlying transport handle.
        pub fn close(self: *Connection, io: std.Io) void {
            self.stream.close(io);
        }

        /// Writes the full HTTP request payload to Docker.
        pub fn writeAll(self: *const Connection, io: std.Io, data: []const u8) !void {
            var write_buffer: [8192]u8 = undefined;
            var net_writer = self.stream.writer(io, &write_buffer);

            try std.Io.Writer.writeAll(&net_writer.interface, data);
            try std.Io.Writer.flush(&net_writer.interface);
        }

        /// Reads up to `dest.len` bytes from Docker.
        pub fn read(self: *const Connection, io: std.Io, dest: []u8) !usize {
            var read_buffer: [4096]u8 = undefined;
            var net_reader = self.stream.reader(io, &read_buffer);

            return try std.Io.Reader.readSliceShort(&net_reader.interface, dest);
        }
    };

    /// Opens a connection to the Docker Engine API endpoint.
    pub fn connect(allocator: std.mem.Allocator, socket_path: []const u8) !Connection {
        _ = allocator;
        const io = blocking_io.io();
        const unix_address = try std.Io.net.UnixAddress.init(socket_path);
        const stream = try unix_address.connect(io);

        return .{ .stream = stream };
    }
};

/// Transport handle for Docker Engine HTTP over a Unix socket or Windows named pipe.
pub const DockerConnection = platform.Connection;

/// Converts Docker socket config paths into a Windows named-pipe path.
pub fn normalizeWindowsPipePath(allocator: std.mem.Allocator, socket_path: []const u8) ![]u8 {
    if (std.mem.startsWith(u8, socket_path, "\\\\.\\")) {
        return try allocator.dupe(u8, socket_path);
    }

    if (std.mem.startsWith(u8, socket_path, "//./")) {
        const remainder = socket_path[4..];
        var normalized: std.ArrayList(u8) = .empty;
        defer normalized.deinit(allocator);

        try normalized.appendSlice(allocator, "\\\\.\\");

        for (remainder) |char| {
            if (char == '/') {
                try normalized.append(allocator, '\\');
            } else {
                try normalized.append(allocator, char);
            }
        }

        return try normalized.toOwnedSlice(allocator);
    }

    return try allocator.dupe(u8, socket_path);
}

/// Opens a connection to the Docker Engine API endpoint.
pub fn connect(allocator: std.mem.Allocator, socket_path: []const u8) !DockerConnection {
    return platform.connect(allocator, socket_path);
}

/// Probes whether the Docker Engine endpoint is reachable.
pub fn probeSocket(allocator: std.mem.Allocator, socket_path: []const u8) bool {
    var connection = connect(allocator, socket_path) catch return false;
    const io = blocking_io.io();
    connection.close(io);
    return true;
}

test "normalizeWindowsPipePath converts docker desktop shorthand" {
    const allocator = std.testing.allocator;
    const normalized = try normalizeWindowsPipePath(allocator, "//./pipe/docker_engine");
    defer allocator.free(normalized);

    try std.testing.expectEqualStrings("\\\\.\\pipe\\docker_engine", normalized);
}
