const std = @import("std");

const blocking_io = @import("../../blocking_io.zig");
const docker_api = @import("docker_api.zig");

/// Interactive Docker exec session over a hijacked Engine API connection.
pub const DockerExecAttach = struct {
    io: std.Io,
    stream: std.Io.net.Stream,
    api: docker_api.DockerApi,
    exec_id: []u8,
    tty: bool,

    /// Starts an attached exec session and returns a live Docker stream.
    pub fn start(
        allocator: std.mem.Allocator,
        // Path to the Docker socket.
        socket_path: []const u8,
        // Container name or id.
        container_ref: []const u8,
        // Command argv to run inside the container.
        command: []const []const u8,
        // Whether stdin is attached.
        attach_stdin: bool,
        // Whether a TTY is allocated.
        allocate_tty: bool,
    ) !DockerExecAttach {
        const io = blocking_io.io();
        const api = docker_api.DockerApi.init(allocator, socket_path);

        const exec_id = try api.createExecInstance(
            container_ref,
            command,
            attach_stdin,
            true,
            true,
            allocate_tty,
        );

        const stream = try api.startExecHijack(exec_id, allocate_tty);

        return .{
            .io = io,
            .stream = stream,
            .api = api,
            .exec_id = exec_id,
            .tty = allocate_tty,
        };
    }

    /// Reads available Docker output bytes into scratch.
    pub fn readOutput(self: *DockerExecAttach, scratch: []u8) !usize {
        var read_buffer: [4096]u8 = undefined;
        var net_reader = self.stream.reader(self.io, &read_buffer);
        const count = try std.Io.Reader.readSliceShort(&net_reader.interface, scratch);

        if (count == 0) {
            return error.EndOfStream;
        }

        if (self.tty) {
            return count;
        }

        return demuxDockerChunk(scratch[0..count], scratch);
    }

    /// Writes stdin bytes to the Docker exec stream.
    pub fn writeInput(self: *DockerExecAttach, bytes: []const u8) !void {
        if (self.tty) {
            try writeAll(&self.stream, self.io, bytes);
            return;
        }

        var frame: [8192]u8 = undefined;
        if (bytes.len + 8 > frame.len) {
            return error.PayloadTooLarge;
        }

        frame[0] = 0;
        frame[1] = 0;
        frame[2] = 0;
        frame[3] = 0;
        frame[4] = @intCast((bytes.len >> 24) & 0xff);
        frame[5] = @intCast((bytes.len >> 16) & 0xff);
        frame[6] = @intCast((bytes.len >> 8) & 0xff);
        frame[7] = @intCast(bytes.len & 0xff);
        @memcpy(frame[8 .. 8 + bytes.len], bytes);
        try writeAll(&self.stream, self.io, frame[0 .. 8 + bytes.len]);
    }

    /// Returns the exec exit code after the stream closes.
    pub fn finish(self: *DockerExecAttach) !u8 {
        self.stream.close(self.io);
        const exit_code = try self.api.inspectExecExitCode(self.exec_id);
        self.api.allocator.free(self.exec_id);
        return exit_code;
    }
};

fn writeAll(stream: *std.Io.net.Stream, io: std.Io, bytes: []const u8) !void {
    var write_buffer: [8192]u8 = undefined;
    var net_writer = stream.writer(io, &write_buffer);
    try net_writer.interface.writeAll(bytes);
    try net_writer.interface.flush();
}

fn demuxDockerChunk(input: []const u8, output: []u8) !usize {
    if (input.len < 8) {
        @memcpy(output[0..input.len], input);
        return input.len;
    }

    const stream_type = input[0];
    if (stream_type != 1 and stream_type != 2) {
        @memcpy(output[0..input.len], input);
        return input.len;
    }

    const frame_size =
        (@as(usize, input[4]) << 24) |
        (@as(usize, input[5]) << 16) |
        (@as(usize, input[6]) << 8) |
        @as(usize, input[7]);

    if (8 + frame_size > input.len) {
        @memcpy(output[0..input.len], input);
        return input.len;
    }

    @memcpy(output[0..frame_size], input[8 .. 8 + frame_size]);
    return frame_size;
}
