const std = @import("std");

var threaded_io: std.Io.Threaded = undefined;
var io_ready = false;

/// Initializes the process-wide blocking I/O runtime with a real allocator and
/// the current process environment.
///
/// Required before subprocess APIs (`std.process.run`) - `global_single_threaded`
/// uses a failing allocator and always returns `error.OutOfMemory` on spawn.
///
/// The `environ` must come from `main`'s `std.process.Init.Minimal`; without it
/// spawned children (e.g. the NetBird daemon) inherit an empty environment and
/// lose PATH.
pub fn init(allocator: std.mem.Allocator, environ: std.process.Environ) void {
    threaded_io = std.Io.Threaded.init(allocator, .{ .environ = environ });
    io_ready = true;
}

/// Returns the process-wide blocking I/O handle for HTTP and subprocess APIs.
pub fn io() std.Io {
    if (!io_ready) {
        threaded_io = std.Io.Threaded.init(std.heap.smp_allocator, .{});
        io_ready = true;
    }

    return threaded_io.io();
}

/// Sleeps for the given number of milliseconds using the blocking I/O clock.
pub fn sleepMs(milliseconds: u64) void {
    std.Io.Timeout.sleep(.{
        .duration = .{
            .raw = std.Io.Duration.fromMilliseconds(@intCast(milliseconds)),
            .clock = .real,
        },
    }, io()) catch {};
}

/// Sleeps for the given number of seconds using the blocking I/O clock.
pub fn sleepSeconds(seconds: u64) void {
    std.Io.Timeout.sleep(.{
        .duration = .{
            .raw = std.Io.Duration.fromSeconds(@intCast(seconds)),
            .clock = .real,
        },
    }, io()) catch {};
}
