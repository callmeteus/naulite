const std = @import("std");

const docker = @import("runtime/docker/docker.zig");
const docker_exec_attach = @import("runtime/docker/docker_exec_attach.zig");
const websocket = @import("websocket.zig");

const DockerToWsContext = struct {
    ws: *websocket.ServerSession,
    session: *docker_exec_attach.DockerExecAttach,
    docker_scratch: []u8,
    done: *std.atomic.Value(bool),
};

/// Handles an interactive exec session over WebSocket.
pub fn handleExecWebSocket(
    allocator: std.mem.Allocator,
    io: std.Io,
    stream: *std.Io.net.Stream,
    header_section: []const u8,
    // Path to the Docker socket.
    docker_socket: []const u8,
    // Docker runtime client for container operations.
    docker_client: *docker.DockerClient,
    // Instance identifier extracted from the request path.
    instance_id: []const u8,
) !void {
    var ws = try websocket.ServerSession.accept(allocator, io, stream, header_section);
    var frame_buffer: [65536]u8 = undefined;

    const init_frame = try ws.readFrame(frame_buffer[0..]);
    if (init_frame.opcode != .text) {
        return error.InvalidExecInitFrame;
    }

    const init = try parseInitFrame(allocator, init_frame.payload);
    defer init.deinit(allocator);

    const container_name = try docker.sanitizeContainerName(allocator, instance_id);
    defer allocator.free(container_name);

    var session = try docker_exec_attach.DockerExecAttach.start(
        allocator,
        docker_socket,
        container_name,
        init.command,
        init.stdin,
        init.tty,
    );

    var docker_done = std.atomic.Value(bool).init(false);
    var docker_scratch: [65536]u8 = undefined;

    const docker_context = DockerToWsContext{
        .ws = &ws,
        .session = &session,
        .docker_scratch = docker_scratch[0..],
        .done = &docker_done,
    };

    const docker_thread = try std.Thread.spawn(.{}, dockerOutputForwarder, .{docker_context});
    defer docker_thread.join();

    while (!docker_done.load(.acquire)) {
        const ws_frame = ws.readFrame(frame_buffer[0..]) catch |err| switch (err) {
            error.EndOfStream => break,
            else => return err,
        };

        switch (ws_frame.opcode) {
            .binary => {
                if (init.stdin) {
                    try session.writeInput(ws_frame.payload);
                }
            },
            .text => {},
            .close => break,
            .ping => {
                try ws.sendFramePong(ws_frame.payload);
            },
            else => {},
        }
    }

    docker_done.store(true, .release);
    const exit_code = try session.finish();
    const exit_body = try std.fmt.allocPrint(allocator, "{{\"exitCode\":{d}}}", .{exit_code});
    defer allocator.free(exit_body);
    try ws.sendText(exit_body);
    _ = docker_client;
}

fn dockerOutputForwarder(context: DockerToWsContext) void {
    while (!context.done.load(.acquire)) {
        const docker_count = context.session.readOutput(context.docker_scratch) catch |err| switch (err) {
            error.EndOfStream => {
                context.done.store(true, .release);
                return;
            },
            else => {
                context.done.store(true, .release);
                return;
            },
        };

        if (docker_count > 0) {
            context.ws.sendBinary(context.docker_scratch[0..docker_count]) catch {
                context.done.store(true, .release);
                return;
            };
        }
    }
}

const InitFrame = struct {
    command: []const []const u8,
    stdin: bool,
    tty: bool,

    fn deinit(self: InitFrame, allocator: std.mem.Allocator) void {
        for (self.command) |arg| {
            allocator.free(arg);
        }
        allocator.free(self.command);
    }
};

fn parseInitFrame(allocator: std.mem.Allocator, payload: []const u8) !InitFrame {
    var parsed = try std.json.parseFromSlice(
        struct {
            command: []const []const u8,
            stdin: ?bool,
            tty: ?bool,
        },
        allocator,
        payload,
        .{},
    );
    defer parsed.deinit();

    if (parsed.value.command.len == 0) {
        return error.InvalidExecInitFrame;
    }

    const stdin_flag = parsed.value.stdin orelse false;
    const tty_flag = parsed.value.tty orelse false;

    const command = try allocator.alloc([]const u8, parsed.value.command.len);
    for (parsed.value.command, 0..) |arg, index| {
        command[index] = try allocator.dupe(u8, arg);
    }

    return .{
        .command = command,
        .stdin = stdin_flag,
        .tty = tty_flag,
    };
}
