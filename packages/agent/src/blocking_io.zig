const std = @import("std");

/// Returns the process-wide blocking I/O handle for HTTP and subprocess APIs.
///
/// Uses Zig 0.16 single-threaded `std.Io` (no worker thread pool).
///
/// @returns Blocking I/O handle
pub fn io() std.Io {
    return std.Io.Threaded.global_single_threaded.io();
}

/// Sleeps for the given number of seconds using the blocking I/O clock.
///
/// @param seconds Sleep duration in whole seconds
pub fn sleepSeconds(seconds: u64) void {
    std.Io.Timeout.sleep(.{
        .duration = .{
            .raw = std.Io.Duration.fromSeconds(@intCast(seconds)),
            .clock = .real,
        },
    }, io()) catch {};
}
