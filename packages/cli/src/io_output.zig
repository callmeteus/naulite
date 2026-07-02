const std = @import("std");

const Io = std.Io;

var stdout_buffer: [8192]u8 = undefined;
var stderr_buffer: [8192]u8 = undefined;
var stdout_writer: Io.File.Writer = undefined;
var stderr_writer: Io.File.Writer = undefined;

/// Binds process I/O writers used by CLI command handlers.
pub fn bind(
    // Process I/O handle from `std.process.Init`.
    io: Io,
) void {
    stdout_writer = Io.File.stdout().writer(io, &stdout_buffer);
    stderr_writer = Io.File.stderr().writer(io, &stderr_buffer);
}

/// Returns the shared stdout writer.
pub fn stdoutWriter() *Io.Writer {
    return &stdout_writer.interface;
}

/// Returns the shared stderr writer.
pub fn stderrWriter() *Io.Writer {
    return &stderr_writer.interface;
}
