const std = @import("std");

const commands = @import("commands.zig");
const control_plane_client = @import("control_plane_client.zig");
const credentials_mod = @import("credentials.zig");
const io_output = @import("io_output.zig");
const resolve_mod = @import("resolve.zig");

pub fn main(init: std.process.Init) !void {
    const allocator = init.gpa;
    io_output.bind(init.io);
    const args = try init.minimal.args.toSlice(init.arena.allocator());

    if (args.len < 2) {
        try printUsage(io_output.stderrWriter());
        return error.InvalidArgument;
    }

    var url_override: ?[]const u8 = null;
    var cp_override: ?[]const u8 = null;
    var port_override: ?u16 = null;
    var index: usize = 1;

    while (index < args.len) : (index += 1) {
        if (std.mem.eql(u8, args[index], "--url")) {
            index += 1;
            if (index >= args.len) {
                return error.InvalidArgument;
            }
            url_override = args[index];
            continue;
        }
        if (std.mem.eql(u8, args[index], "--cp")) {
            index += 1;
            if (index >= args.len) {
                return error.InvalidArgument;
            }
            cp_override = args[index];
            continue;
        }
        if (std.mem.eql(u8, args[index], "--port")) {
            index += 1;
            if (index >= args.len) {
                return error.InvalidArgument;
            }
            port_override = try std.fmt.parseInt(u16, args[index], 10);
            continue;
        }
        if (std.mem.eql(u8, args[index], "--help") or std.mem.eql(u8, args[index], "-h")) {
            try printUsage(io_output.stdoutWriter());
            return;
        }
        break;
    }

    if (index >= args.len) {
        try printUsage(io_output.stderrWriter());
        return error.InvalidArgument;
    }

    if (std.mem.eql(u8, args[index], "login")) {
        try handleLogin(allocator, init.io, init.environ_map, args[index..]);
        return;
    }

    const resolved = try resolve_mod.resolve(allocator, init.io, init.environ_map, url_override, cp_override, port_override);
    defer resolved.config.deinit(allocator);

    var client = control_plane_client.Client.init(allocator, init.io, resolved.config);
    defer client.deinit();

    const exit_code = try dispatch(allocator, &client, args[index..]);
    if (exit_code != 0) {
        std.process.exit(exit_code);
    }
}

/// Saves remote control plane credentials for NetBird access.
fn handleLogin(
    allocator: std.mem.Allocator,
    // Process I/O handle.
    io: std.Io,
    // Process environment map.
    environ_map: *const std.process.Environ.Map,
    // Remaining argv after the login subcommand.
    argv: []const []const u8,
) !void {
    var cp_host: ?[]const u8 = null;
    var api_key: ?[]const u8 = null;
    var port: u16 = 8080;
    var index: usize = 1;

    while (index < argv.len) : (index += 1) {
        if (std.mem.eql(u8, argv[index], "--cp")) {
            index += 1;
            if (index >= argv.len) {
                return error.InvalidArgument;
            }
            cp_host = argv[index];
            continue;
        }
        if (std.mem.eql(u8, argv[index], "--key")) {
            index += 1;
            if (index >= argv.len) {
                return error.InvalidArgument;
            }
            api_key = argv[index];
            continue;
        }
        if (std.mem.eql(u8, argv[index], "--port")) {
            index += 1;
            if (index >= argv.len) {
                return error.InvalidArgument;
            }
            port = try std.fmt.parseInt(u16, argv[index], 10);
            continue;
        }
        return error.InvalidArgument;
    }

    if (api_key == null) {
        return error.InvalidArgument;
    }

    var existing = try credentials_mod.load(allocator, io, environ_map);
    defer if (existing) |*credentials| credentials.deinit(allocator);

    const resolved_host = cp_host orelse if (existing) |credentials| credentials.cp_host else null;

    try credentials_mod.save(allocator, io, environ_map, .{
        .api_key = api_key,
        .cp_host = resolved_host,
        .cp_port = port,
    });

    const stdout = io_output.stdoutWriter();
    try stdout.writeAll("Credentials saved.\n");
}

/// Dispatches parsed CLI arguments to command handlers.
fn dispatch(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *control_plane_client.Client,
    // Remaining argv after global flags.
    argv: []const []const u8,
) !u8 {
    if (argv.len == 0) {
        return error.InvalidArgument;
    }

    if (!std.mem.eql(u8, argv[0], "cluster")) {
        try printUsage(io_output.stderrWriter());
        return error.InvalidArgument;
    }

    if (argv.len < 3) {
        return error.InvalidArgument;
    }

    if (matchesAction(argv, "nodes", "get")) {
        return try runVoid(commands.getNodes(allocator, client));
    }
    if (matchesAction(argv, "services", "get")) {
        return try runVoid(commands.getServices(allocator, client));
    }
    if (matchesAction(argv, "instances", "get")) {
        return try runVoid(commands.getInstances(allocator, client));
    }
    if (matchesAction(argv, "volumes", "get")) {
        return try runVoid(commands.getVolumes(allocator, client));
    }
    if (matchesAction(argv, "secrets", "get")) {
        return try runVoid(commands.getSecrets(allocator, client));
    }
    if (matchesAction(argv, "backups", "get")) {
        return try runVoid(commands.getBackups(allocator, client));
    }
    if (matchesAction(argv, "status", "get")) {
        return try runVoid(commands.clusterStatus(allocator, client));
    }
    if (matchesAction(argv, "manifests", "apply")) {
        const manifest_path = readFlagValue(argv, "-f", "--file") orelse return error.InvalidArgument;
        return try runVoid(commands.applyManifest(allocator, client, manifest_path));
    }
    if (std.mem.eql(u8, argv[1], "services") and std.mem.eql(u8, argv[2], "delete")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.deleteResource(allocator, client, "service", argv[3]));
    }
    if (std.mem.eql(u8, argv[1], "volumes") and std.mem.eql(u8, argv[2], "delete")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.deleteResource(allocator, client, "volume", argv[3]));
    }
    if (std.mem.eql(u8, argv[1], "secrets") and std.mem.eql(u8, argv[2], "delete")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.deleteResource(allocator, client, "secret", argv[3]));
    }
    if (std.mem.eql(u8, argv[1], "services") and std.mem.eql(u8, argv[2], "rotate-logs")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.rotateLogs(allocator, client, argv[3]));
    }
    if (std.mem.eql(u8, argv[1], "instances") and std.mem.eql(u8, argv[2], "logs")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        const tail = try readTailFlag(argv[3..]);
        return try runVoid(commands.fetchLogs(allocator, client, argv[3], tail));
    }
    if (std.mem.eql(u8, argv[1], "instances") and std.mem.eql(u8, argv[2], "exec")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        const command_argv = try sliceExecCommand(allocator, argv[4..]);
        defer allocator.free(command_argv);
        return commands.execInstance(allocator, client, argv[3], command_argv);
    }
    if (matchesAction(argv, "builds", "run")) {
        const service_name = readFlagValue(argv, "--service", "--service") orelse return error.InvalidArgument;
        const provider = readOptionalFlagValue(argv, "--provider");
        const registry = readOptionalFlagValue(argv, "--registry");
        return try runVoid(commands.triggerBuild(allocator, client, service_name, provider, registry));
    }
    if (matchesAction(argv, "registries", "get")) {
        return try runVoid(commands.listRegistries(allocator, client));
    }
    if (matchesAction(argv, "ingress", "get")) {
        return try runVoid(commands.listIngress(allocator, client));
    }
    if (std.mem.eql(u8, argv[1], "backups") and std.mem.eql(u8, argv[2], "run")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.runBackup(allocator, client, argv[3]));
    }
    if (std.mem.eql(u8, argv[1], "backups") and std.mem.eql(u8, argv[2], "restore")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.restoreBackup(allocator, client, argv[3]));
    }
    if (matchesAction(argv, "gitops", "get")) {
        return try runVoid(commands.getGitOpsRevisions(allocator, client));
    }
    if (std.mem.eql(u8, argv[1], "gitops") and std.mem.eql(u8, argv[2], "rollback")) {
        if (argv.len < 4) {
            return error.InvalidArgument;
        }
        return try runVoid(commands.rollbackGitOps(allocator, client, argv[3]));
    }
    if (matchesAction(argv, "netbird", "topology")) {
        return try runVoid(commands.getNetBirdTopology(allocator, client));
    }
    if (matchesAction(argv, "netbird", "devices")) {
        return try runVoid(commands.getNetBirdDevices(allocator, client));
    }
    if (matchesAction(argv, "netbird", "groups")) {
        return try runVoid(commands.getNetBirdGroups(allocator, client));
    }
    if (matchesAction(argv, "netbird", "acls")) {
        return try runVoid(commands.getNetBirdAcls(allocator, client));
    }
    if (matchesAction(argv, "metrics", "get")) {
        return try runVoid(commands.getMetrics(allocator, client));
    }

    try printUsage(io_output.stderrWriter());
    return error.InvalidArgument;
}

fn matchesAction(argv: []const []const u8, resource: []const u8, action: []const u8) bool {
    return std.mem.eql(u8, argv[1], resource) and std.mem.eql(u8, argv[2], action);
}

fn runVoid(result: anyerror!void) !u8 {
    try result;
    return 0;
}

fn readFlagValue(argv: []const []const u8, short: []const u8, long: []const u8) ?[]const u8 {
    var index: usize = 0;
    while (index < argv.len) : (index += 1) {
        if (std.mem.eql(u8, argv[index], short) or std.mem.eql(u8, argv[index], long)) {
            if (index + 1 < argv.len) {
                return argv[index + 1];
            }
            return null;
        }
    }
    return null;
}

fn readOptionalFlagValue(argv: []const []const u8, flag: []const u8) ?[]const u8 {
    return readFlagValue(argv, flag, flag);
}

fn readTailFlag(argv: []const []const u8) !u32 {
    const tail_value = readFlagValue(argv, "--tail", "--tail") orelse return 200;
    return try std.fmt.parseInt(u32, tail_value, 10);
}

fn sliceExecCommand(
    allocator: std.mem.Allocator,
    // Arguments after the instance id.
    argv: []const []const u8,
) ![]const []const u8 {
    var start: usize = 0;
    if (argv.len > 0 and std.mem.eql(u8, argv[0], "--")) {
        start = 1;
    }

    if (start >= argv.len) {
        return error.InvalidArgument;
    }

    const slice = try allocator.alloc([]const u8, argv.len - start);
    @memcpy(slice, argv[start..]);
    return slice;
}

fn printUsage(writer: anytype) !void {
    try writer.writeAll(
        \\platform - kubectl-style CLI for the Platform control plane
        \\
        \\Usage:
        \\  platform login --cp <netbird-ip> --key <secret> [--port <port>]
        \\  platform [--url <url>] [--cp <host>] [--port <port>] cluster nodes get
        \\  platform cluster services get|delete <name>|rotate-logs <name>
        \\  platform cluster instances get|logs <id>|exec <id> -- <command...>
        \\  platform cluster volumes get|delete <name>
        \\  platform cluster secrets get|delete <name>
        \\  platform cluster backups get|run <volume>|restore <backupId>
        \\  platform cluster gitops get|rollback <revisionId>
        \\  platform cluster netbird topology|devices|groups|acls
        \\  platform cluster metrics get
        \\  platform cluster status get
        \\  platform cluster manifests apply -f <manifest.yml>
        \\  platform cluster builds run --service <name> [--provider <name>] [--registry <name>]
        \\  platform cluster registries get
        \\  platform cluster ingress get
        \\
        \\Remote access:
        \\  Generate an API key in the panel, then run `platform login` with the NetBird IP.
        \\  When a local control plane is detected on port 8080, auth is skipped automatically.
        \\
        \\Environment:
        \\  PLATFORM_CP_URL     Control plane base URL
        \\  PLATFORM_API_KEY    API key secret for remote access
        \\  PLATFORM_TOKEN      Alias for PLATFORM_API_KEY
        \\
    );
}
