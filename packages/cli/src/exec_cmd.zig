const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const exec_stream = @import("exec_stream.zig");
const exec_target = @import("exec_target.zig");
const io_output = @import("io_output.zig");

/// Parsed `naulite exec` arguments.
pub const ExecOptions = struct {
    attach_stdin: bool = false,
    allocate_tty: bool = false,
    target: []const u8,
    command_argv: []const []const u8,
};

const DEFAULT_SHELL = "/bin/sh";

/// Parses exec argv after the `exec` subcommand token.
pub fn parseExecOptions(
    allocator: std.mem.Allocator,
    // Arguments after `exec`.
    argv: []const []const u8,
) !ExecOptions {
    var attach_stdin = false;
    var allocate_tty = false;
    var index: usize = 0;

    while (index < argv.len) {
        const arg = argv[index];

        if (std.mem.eql(u8, arg, "-i")) {
            attach_stdin = true;
            index += 1;
            continue;
        }

        if (std.mem.eql(u8, arg, "-t")) {
            allocate_tty = true;
            index += 1;
            continue;
        }

        if (std.mem.eql(u8, arg, "-it") or std.mem.eql(u8, arg, "-ti")) {
            attach_stdin = true;
            allocate_tty = true;
            index += 1;
            continue;
        }

        break;
    }

    if (index >= argv.len) {
        return error.InvalidArgument;
    }

    const target = argv[index];
    index += 1;

    var command_start = index;
    if (command_start < argv.len and std.mem.eql(u8, argv[command_start], "--")) {
        command_start += 1;
    }

    var command_argv: []const []const u8 = &.{};

    if (command_start < argv.len) {
        const slice = try allocator.alloc([]const u8, argv.len - command_start);
        @memcpy(slice, argv[command_start..]);
        command_argv = slice;
    } else if (attach_stdin or allocate_tty) {
        const slice = try allocator.alloc([]const u8, 1);
        slice[0] = DEFAULT_SHELL;
        command_argv = slice;
    } else {
        return error.InvalidArgument;
    }

    return .{
        .attach_stdin = attach_stdin,
        .allocate_tty = allocate_tty,
        .target = target,
        .command_argv = command_argv,
    };
}

/// Runs `naulite exec` against the control plane.
pub fn runExec(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
    // Parsed exec options.
    options: ExecOptions,
) !u8 {
    const resolution = try exec_target.resolveTarget(allocator, client, options.target);

    const instance_id = switch (resolution) {
        .resolved => |id| id,
        else => {
            try exec_target.printResolutionError(allocator, resolution);
            return 1;
        },
    };
    defer allocator.free(instance_id);

    if (options.attach_stdin or options.allocate_tty) {
        return exec_stream.runInteractive(
            allocator,
            client,
            instance_id,
            options.command_argv,
            options.attach_stdin,
            options.allocate_tty,
        );
    }

    return execInstanceBuffered(allocator, client, instance_id, options.command_argv);
}

fn execInstanceBuffered(
    allocator: std.mem.Allocator,
    client: *Client,
    instance_id: []const u8,
    command_argv: []const []const u8,
) !u8 {
    const stdout = io_output.stdoutWriter();
    const stderr = io_output.stderrWriter();
    const path = try std.fmt.allocPrint(allocator, "/instances/{s}/exec", .{instance_id});
    defer allocator.free(path);

    const body = try std.json.Stringify.valueAlloc(allocator, .{ .command = command_argv }, .{});
    defer allocator.free(body);

    const response = try client.postJson(path, body);
    defer allocator.free(response.body);

    var parsed = try std.json.parseFromSlice(
        struct {
            stdout: []const u8,
            stderr: []const u8,
            exitCode: i32,
        },
        allocator,
        response.body,
        .{},
    );
    defer parsed.deinit();

    try stdout.writeAll(parsed.value.stdout);
    try stderr.writeAll(parsed.value.stderr);
    return @intCast(parsed.value.exitCode);
}
