const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const Config = @import("config.zig").Config;
const credentials_mod = @import("credentials.zig");

pub const ResolvedTarget = struct {
    config: Config,
    mode: Mode,
};

pub const Mode = enum {
    local,
    remote,
};

const DEFAULT_PORT: u16 = 8080;

/// Probes whether a local control plane responds on the given port.
pub fn probeLocalControlPlane(allocator: std.mem.Allocator, port: u16) !bool {
    const url_127 = try std.fmt.allocPrint(allocator, "http://127.0.0.1:{d}", .{port});
    defer allocator.free(url_127);
    const url_localhost = try std.fmt.allocPrint(allocator, "http://localhost:{d}", .{port});
    defer allocator.free(url_localhost);

    const urls = [_][]const u8{ url_127, url_localhost };

    for (urls) |base_url| {
        var client = Client.init(allocator, .{ .base_url = base_url, .token = null });
        defer client.deinit();

        const response = client.get("/health") catch continue;
        defer allocator.free(response.body);

        if (response.status >= 200 and response.status < 300) {
            return true;
        }
    }

    return false;
}

fn buildBaseUrl(allocator: std.mem.Allocator, host: []const u8, port: u16) ![]const u8 {
    return std.fmt.allocPrint(allocator, "http://{s}:{d}", .{ host, port });
}

fn resolveApiKey(credentials: ?credentials_mod.Credentials) ?[]const u8 {
    if (std.posix.getenv("PLATFORM_API_KEY")) |value| {
        return value;
    }
    if (std.posix.getenv("PLATFORM_TOKEN")) |value| {
        return value;
    }
    if (credentials) |saved| {
        return saved.api_key;
    }
    return null;
}

/// Resolves the control plane URL and auth mode for CLI execution.
pub fn resolve(
    allocator: std.mem.Allocator,
    url_override: ?[]const u8,
    cp_override: ?[]const u8,
    port_override: ?u16,
) !ResolvedTarget {
    var saved = try credentials_mod.load(allocator);
    defer if (saved) |*credentials| credentials.deinit(allocator);

    const port = port_override orelse if (saved) |credentials| credentials.cp_port else DEFAULT_PORT;
    const api_key = resolveApiKey(saved);

    if (url_override) |url| {
        return .{
            .config = .{
                .base_url = try Config.trimTrailingSlashOwned(allocator, url),
                .token = api_key,
            },
            .mode = .remote,
        };
    }

    if (cp_override) |host| {
        if (api_key == null) {
            return error.MissingApiKey;
        }

        return .{
            .config = .{
                .base_url = try buildBaseUrl(allocator, host, port),
                .token = api_key,
            },
            .mode = .remote,
        };
    }

    if (std.posix.getenv("PLATFORM_CP_URL")) |env_url| {
        return .{
            .config = .{
                .base_url = try Config.trimTrailingSlashOwned(allocator, env_url),
                .token = api_key,
            },
            .mode = .remote,
        };
    }

    if (try probeLocalControlPlane(allocator, port)) {
        return .{
            .config = .{
                .base_url = try buildBaseUrl(allocator, "127.0.0.1", port),
                .token = null,
            },
            .mode = .local,
        };
    }

    if (saved) |credentials| {
        if (credentials.cp_host) |host| {
            if (api_key == null) {
                return error.MissingApiKey;
            }

            return .{
                .config = .{
                    .base_url = try buildBaseUrl(allocator, host, port),
                    .token = api_key,
                },
                .mode = .remote,
            };
        }
    }

    return .{
        .config = .{
            .base_url = try buildBaseUrl(allocator, "127.0.0.1", port),
            .token = null,
        },
        .mode = .local,
    };
}
