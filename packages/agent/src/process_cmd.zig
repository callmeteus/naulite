const std = @import("std");

/// Runs a subprocess and fails when the exit code is non-zero.
///
/// @param allocator Allocator for output buffers
/// @param argv Command argv slice
/// @returns Nothing.
pub fn runCommandVoid(allocator: std.mem.Allocator, argv: []const []const u8) !void {
    const captured = try runCapture(allocator, argv);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        std.log.debug("[process_cmd] command failed argv0={s} code={d} stderr={s}", .{
            argv[0],
            captured.exit_code,
            captured.stderr,
        });
        return error.CommandFailed;
    }
}

/// Runs a subprocess and returns captured stdout on success.
///
/// @param allocator Allocator for output buffers
/// @param argv Command argv slice
/// @returns Captured stdout or stderr when stdout is empty
pub fn runCommand(allocator: std.mem.Allocator, argv: []const []const u8) ![]u8 {
    const captured = try runCapture(allocator, argv);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        std.log.debug("[process_cmd] command failed argv0={s} code={d} stderr={s}", .{
            argv[0],
            captured.exit_code,
            captured.stderr,
        });
        allocator.free(captured.stdout);
        return error.CommandFailed;
    }

    if (captured.stdout.len == 0 and captured.stderr.len > 0) {
        allocator.free(captured.stdout);
        return try allocator.dupe(u8, captured.stderr);
    }

    return captured.stdout;
}

/// Runs a subprocess and returns stdout, stderr, and termination status.
///
/// @param allocator Allocator for output buffers
/// @param argv Command argv slice
/// @returns Captured process output
pub fn runCapture(allocator: std.mem.Allocator, argv: []const []const u8) !CaptureResult {
    const blocking_io = @import("blocking_io.zig");
    const io = blocking_io.io();

    const result = try std.process.run(allocator, io, .{
        .argv = argv,
    });

    var exit_code: u8 = 255;
    var exited_normally = false;
    switch (result.term) {
        .exited => |code| {
            exit_code = code;
            exited_normally = true;
        },
        else => {},
    }

    return .{
        .stdout = result.stdout,
        .stderr = result.stderr,
        .exit_code = exit_code,
        .exited_normally = exited_normally,
    };
}

/// Captured output from a subprocess invocation.
pub const CaptureResult = struct {
    stdout: []u8,
    stderr: []u8,
    exit_code: u8,
    exited_normally: bool,
};
