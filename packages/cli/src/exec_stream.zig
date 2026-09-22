const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const Config = @import("config.zig").Config;
const io_output = @import("io_output.zig");
const websocket = @import("websocket.zig");

const WsReaderContext = struct {
    conn: *websocket.Connection,
    io: std.Io,
    read_buffer: []u8,
    scratch: []u8,
    exit_code: *std.atomic.Value(i32),
    done: *std.atomic.Value(bool),
};

const exit_code_unset: i32 = -1;

/// Runs an interactive exec session over WebSocket.
pub fn runInteractive(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
    // Resolved instance identifier.
    instance_id: []const u8,
    // Command argv to execute.
    command_argv: []const []const u8,
    // Whether stdin is attached.
    attach_stdin: bool,
    // Whether a TTY is allocated.
    allocate_tty: bool,
) !u8 {
    var terminal = try TerminalSession.enter(allocate_tty);
    defer terminal.exit();

    const ws_url = try buildWebSocketUrl(allocator, &client.config, instance_id);
    defer allocator.free(ws_url);

    var conn = try websocket.Connection.connect(
        allocator,
        client.io,
        ws_url,
        client.config.token,
        client.config.tenant_slug,
    );
    defer conn.close(client.io);

    const init_body = try std.json.Stringify.valueAlloc(allocator, .{
        .command = command_argv,
        .stdin = attach_stdin,
        .tty = allocate_tty,
    }, .{});
    defer allocator.free(init_body);

    try conn.sendText(allocator, init_body);

    var stdin_buffer: [4096]u8 = undefined;
    var exit_code = std.atomic.Value(i32).init(exit_code_unset);
    var reader_done = std.atomic.Value(bool).init(false);
    var scratch: [65536]u8 = undefined;

    const reader_context = WsReaderContext{
        .conn = &conn,
        .io = client.io,
        .read_buffer = conn.read_buffer,
        .scratch = scratch[0..],
        .exit_code = &exit_code,
        .done = &reader_done,
    };

    const reader_thread = try std.Thread.spawn(.{}, websocketReaderLoop, .{reader_context});
    defer reader_thread.join();

    while (!reader_done.load(.acquire)) {
        if (attach_stdin) {
            const stdin_count = readStdinAvailable(stdin_buffer[0..]) catch 0;
            if (stdin_count > 0) {
                try conn.sendBinary(stdin_buffer[0..stdin_count]);
            }
        }

        std.Io.Timeout.sleep(.{
            .duration = .{
                .raw = std.Io.Duration.fromNanoseconds(10_000_000),
                .clock = .real,
            },
        }, client.io) catch {};
    }

    const code = exit_code.load(.acquire);
    if (code != exit_code_unset) {
        return @intCast(code);
    }

    return 1;
}

fn websocketReaderLoop(context: WsReaderContext) void {
    const stdout = io_output.stdoutWriter();

    while (!context.done.load(.acquire)) {
        const frame = context.conn.readFrame(context.conn.allocator, context.scratch) catch |err| switch (err) {
            error.EndOfStream => {
                context.done.store(true, .release);
                return;
            },
            else => {
                context.done.store(true, .release);
                return;
            },
        };

        switch (frame.opcode) {
            .text => {
                if (parseExitCodeFrame(context.conn.allocator, frame.payload)) |code| {
                    context.exit_code.store(code, .release);
                    context.done.store(true, .release);
                    return;
                } else |_| {}
            },
            .binary => {
                stdout.writeAll(frame.payload) catch {
                    context.done.store(true, .release);
                    return;
                };
            },
            .close => {
                context.done.store(true, .release);
                return;
            },
            else => {},
        }
    }
}

fn buildWebSocketUrl(
    allocator: std.mem.Allocator,
    config: *const Config,
    instance_id: []const u8,
) ![]u8 {
    var base = config.base_url;

    if (std.mem.startsWith(u8, base, "https://")) {
        base = base["https://".len..];
        return std.fmt.allocPrint(
            allocator,
            "wss://{s}/instances/{s}/exec/ws",
            .{ base, instance_id },
        );
    }

    if (std.mem.startsWith(u8, base, "http://")) {
        base = base["http://".len..];
    }

    return std.fmt.allocPrint(
        allocator,
        "ws://{s}/instances/{s}/exec/ws",
        .{ base, instance_id },
    );
}

fn parseExitCodeFrame(
    allocator: std.mem.Allocator,
    payload: []const u8,
) !i32 {
    var parsed = try std.json.parseFromSlice(
        struct { exitCode: i32 },
        allocator,
        payload,
        .{},
    );
    defer parsed.deinit();
    return parsed.value.exitCode;
}

fn readStdinAvailable(buffer: []u8) !usize {
    if (comptime builtin.os.tag == .windows) {
        return readStdinWindows(buffer);
    }

    return readStdinPosix(buffer);
}

fn readStdinPosix(buffer: []u8) !usize {
    const stdin_fd: std.posix.fd_t = 0;
    const count = std.posix.read(stdin_fd, buffer) catch |err| switch (err) {
        error.WouldBlock => return 0,
        else => return err,
    };
    return count;
}

fn readStdinWindows(buffer: []u8) !usize {
    _ = buffer;
    return 0;
}

const builtin = @import("builtin");

/// Saves and restores terminal state for interactive exec.
const TerminalSession = struct {
    active: bool = false,

    fn enter(allocate_tty: bool) !TerminalSession {
        if (!allocate_tty) {
            return .{};
        }

        if (comptime builtin.os.tag == .windows) {
            try enableWindowsConsoleRawMode();
            return .{ .active = true };
        }

        try enablePosixRawMode();
        return .{ .active = true };
    }

    fn exit(self: *TerminalSession) void {
        if (!self.active) {
            return;
        }

        if (comptime builtin.os.tag == .windows) {
            restoreWindowsConsoleMode();
        } else {
            restorePosixRawMode();
        }
    }
};

var saved_posix_termios: ?std.posix.termios = null;

fn enablePosixRawMode() !void {
    const stdin_fd: std.posix.fd_t = 0;
    var termios = try std.posix.tcgetattr(stdin_fd);
    saved_posix_termios = termios;
    termios.lflag.ICANON = false;
    termios.lflag.ECHO = false;
    termios.cc[@intFromEnum(std.posix.V.MIN)] = 0;
    termios.cc[@intFromEnum(std.posix.V.TIME)] = 1;
    try std.posix.tcsetattr(stdin_fd, .FLUSH, termios);
}

fn restorePosixRawMode() void {
    const stdin_fd: std.posix.fd_t = 0;
    if (saved_posix_termios) |termios| {
        std.posix.tcsetattr(stdin_fd, .FLUSH, termios) catch {};
        saved_posix_termios = null;
    }
}

fn enableWindowsConsoleRawMode() !void {}

fn restoreWindowsConsoleMode() void {}
