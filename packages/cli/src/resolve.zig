const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const Config = @import("config.zig").Config;
const credentials_mod = @import("credentials.zig");

/// Resolved control plane target for CLI execution.
pub const ResolvedTarget = struct {
    // Connection settings for API calls.
    config: Config,

    // Whether the CLI targets a local or remote control plane.
    mode: Mode,
};

/// Control plane reachability mode.
pub const Mode = enum {
    local,
    remote,
};

const DEFAULT_PORT: u16 = 8080;

/// Probes whether a local control plane responds on the given port.
pub fn probeLocalControlPlane(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // TCP port to probe.
    port: u16,
) !bool {
    const url_127 = try std.fmt.allocPrint(allocator, "http://127.0.0.1:{d}", .{port});
    defer allocator.free(url_127);
    const url_localhost = try std.fmt.allocPrint(allocator, "http://localhost:{d}", .{port});
    defer allocator.free(url_localhost);

    const urls = [_][]const u8{ url_127, url_localhost };

    for (urls) |base_url| {
        var client = Client.init(allocator, io, .{ .base_url = base_url, .token = null });
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

fn resolveApiKey(
    environ_map: *const std.process.Environ.Map,
    credentials: ?credentials_mod.Credentials,
) ?[]const u8 {
    if (environ_map.get("PLATFORM_API_KEY")) |value| {
        return value;
    }
    if (environ_map.get("PLATFORM_TOKEN")) |value| {
        return value;
    }
    if (credentials) |saved| {
        return saved.api_key;
    }
    return null;
}

fn resolveTenantSlug(credentials: ?credentials_mod.Credentials) ?[]const u8 {
    if (credentials) |saved| {
        return saved.tenant_slug;
    }
    return null;
}

/// Resolves the control plane URL and auth mode for CLI execution.
pub fn resolve(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Process environment map.
    environ_map: *const std.process.Environ.Map,
    // Optional `--url` override.
    url_override: ?[]const u8,
    // Optional `--cp` host override.
    cp_override: ?[]const u8,
    // Optional `--port` override.
    port_override: ?u16,
) !ResolvedTarget {
    var saved = try credentials_mod.load(allocator, io, environ_map);
    defer if (saved) |*credentials| credentials.deinit(allocator);

    const port = port_override orelse if (saved) |credentials| credentials.cp_port else DEFAULT_PORT;
    const api_key = resolveApiKey(environ_map, saved);
    const tenant_slug = resolveTenantSlug(saved);

    if (url_override) |url| {
        return .{
            .config = .{
                .base_url = try Config.trimTrailingSlashOwned(allocator, url),
                .token = api_key,
                .tenant_slug = tenant_slug,
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
                .tenant_slug = tenant_slug,
            },
            .mode = .remote,
        };
    }

    if (environ_map.get("PLATFORM_CP_URL")) |env_url| {
        return .{
            .config = .{
                .base_url = try Config.trimTrailingSlashOwned(allocator, env_url),
                .token = api_key,
                .tenant_slug = tenant_slug,
            },
            .mode = .remote,
        };
    }

    if (try probeLocalControlPlane(allocator, io, port)) {
        return .{
            .config = .{
                .base_url = try buildBaseUrl(allocator, "127.0.0.1", port),
                .token = null,
                .tenant_slug = tenant_slug,
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
                    .tenant_slug = tenant_slug,
                },
                .mode = .remote,
            };
        }
    }

    return .{
        .config = .{
            .base_url = try buildBaseUrl(allocator, "127.0.0.1", port),
            .token = null,
            .tenant_slug = tenant_slug,
        },
        .mode = .local,
    };
}
