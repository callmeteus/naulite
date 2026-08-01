const std = @import("std");

const http_server = @import("http_server.zig");
const logger = @import("logger");

const docker = @import("runtime/docker/docker.zig");

const log_http = logger.Logger.create("http");
const ws2 = std.os.windows.ws2_32;

const WSA_VERSION: u16 = 0x0202;

extern "ws2_32" fn WSAStartup(w_version_requested: u16, wsa_data: *anyopaque) callconv(.c) c_int;
extern "ws2_32" fn WSACleanup() callconv(.c) c_int;
extern "ws2_32" fn socket(af: c_int, sock_type: c_int, protocol: c_int) callconv(.c) std.posix.socket_t;
extern "ws2_32" fn accept(
    socket_handle: std.posix.socket_t,
    address: ?*ws2.sockaddr,
    address_length: ?*c_int,
) callconv(.c) std.posix.socket_t;
extern "ws2_32" fn closesocket(socket_handle: std.posix.socket_t) callconv(.c) c_int;

fn isInvalidSocket(socket_handle: std.posix.socket_t) bool {
    return @intFromPtr(socket_handle) == std.math.maxInt(usize);
}

/// Starts a blocking Winsock HTTP server on Windows.
pub fn serve(
    allocator: std.mem.Allocator,
    // Process I/O handle used by route handlers that spawn subprocesses.
    io: std.Io,
    // HTTP server and Docker client configuration.
    config: http_server.Config,
) !void {
    var wsa_data: [512]u8 align(4) = undefined;

    if (WSAStartup(WSA_VERSION, &wsa_data) != 0) {
        return error.WsaStartupFailed;
    }

    defer _ = WSACleanup();

    const listen_socket = socket(@intCast(ws2.AF.INET), @intCast(ws2.SOCK.STREAM), @intCast(ws2.IPPROTO.TCP));

    if (isInvalidSocket(listen_socket)) {
        return error.SocketCreateFailed;
    }

    defer _ = closesocket(listen_socket);

    const reuse_addr: c_int = 1;

    if (std.c.setsockopt(
        listen_socket,
        ws2.SOL.SOCKET,
        ws2.SO.REUSEADDR,
        @ptrCast(&reuse_addr),
        @sizeOf(c_int),
    ) != 0) {
        return error.SocketOptionFailed;
    }

    var bind_address: ws2.sockaddr.in = .{
        .family = ws2.AF.INET,
        .port = std.mem.nativeToBig(u16, config.listen_port),
        .addr = 0,
    };

    if (std.c.bind(
        listen_socket,
        @ptrCast(&bind_address),
        @intCast(@sizeOf(ws2.sockaddr.in)),
    ) != 0) {
        return error.BindFailed;
    }

    if (std.c.listen(listen_socket, 128) != 0) {
        return error.ListenFailed;
    }

    log_http.info("listening on {s}:{d}", .{ config.listen_address, config.listen_port });

    var docker_client = docker.DockerClient.init(allocator, config.docker_socket);
    defer docker_client.deinit();

    while (true) {
        const client_socket = accept(listen_socket, null, null);

        if (isInvalidSocket(client_socket)) {
            log_http.warn("accept failed", .{});
            continue;
        }

        var stream = std.Io.net.Stream{
            .socket = .{
                .handle = client_socket,
                .address = .{ .ip4 = .{ .bytes = .{ 0, 0, 0, 0 }, .port = 0 } },
            },
        };

        http_server.handleConnection(allocator, io, &docker_client, config.docker_socket, &stream) catch |err| {
            log_http.warn("connection failed: {}", .{err});
        };

        _ = closesocket(client_socket);
    }
}
