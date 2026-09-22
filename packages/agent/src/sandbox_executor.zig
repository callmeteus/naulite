const logger = @import("logger");

const log_sandbox = logger.Logger.create("sandbox");

const std = @import("std");

const process_cmd = @import("process_cmd.zig");

/// JSON HTTP response for sandbox task handlers.
pub const SandboxTaskResult = struct {
    status: []const u8,
    body: []const u8,
    error_message: ?[]const u8,
    http_status: u16,
};

/// Clones an Incus snapshot into a new instance name.
///
/// @param allocator Allocator for JSON buffers
/// @param body Clone request JSON
/// @returns JSON response body
pub fn executeCloneTask(allocator: std.mem.Allocator, body: []const u8) !SandboxTaskResult {
    const parent = try readStringField(allocator, body, "parent");
    defer allocator.free(parent);
    const instance = try readStringField(allocator, body, "instance");
    defer allocator.free(instance);
    const snapshot = readOptionalString(body, "snapshot") orelse "base";

    const source = try std.fmt.allocPrint(allocator, "{s}/{s}", .{ parent, snapshot });
    defer allocator.free(source);

    const copy_argv = [_][]const u8{ "incus", "copy", source, instance };
    process_cmd.runCommandVoid(allocator, &copy_argv) catch {
        return failedResult(allocator, "incus copy failed.", 500);
    };

    const modules_volume = readOptionalString(body, "modulesVolume");
    if (modules_volume) |volume_name| {
        const source_arg = try std.fmt.allocPrint(allocator, "source={s}", .{volume_name});
        defer allocator.free(source_arg);
        const path_arg = try std.fmt.allocPrint(allocator, "path={s}", .{"/workspace/node_modules"});
        defer allocator.free(path_arg);
        const attach_argv = [_][]const u8{
            "incus",
            "config",
            "device",
            "add",
            instance,
            "modules",
            "disk",
            source_arg,
            path_arg,
        };
        process_cmd.runCommandVoid(allocator, &attach_argv) catch {
            return failedResult(allocator, "incus modules volume attach failed.", 500);
        };
    }

    const start = readOptionalBool(body, "start") orelse true;

    if (start) {
        const start_argv = [_][]const u8{ "incus", "start", instance };
        process_cmd.runCommandVoid(allocator, &start_argv) catch {
            return failedResult(allocator, "incus start failed.", 500);
        };
    }

    const response_body = try std.fmt.allocPrint(
        allocator,
        "{{\"instance\":\"{s}\",\"status\":\"{s}\"}}",
        .{ instance, if (start) "running" else "stopped" },
    );

    return successResult(allocator, response_body, if (start) "running" else "stopped", 200);
}

/// Runs a command inside a sandbox instance via incus exec.
///
/// @param allocator Allocator for JSON buffers
/// @param body Exec request JSON
/// @returns JSON response body
pub fn executeExecTask(allocator: std.mem.Allocator, body: []const u8) !SandboxTaskResult {
    const instance = try readStringField(allocator, body, "instance");
    defer allocator.free(instance);
    const workdir = readOptionalString(body, "workdir") orelse "/workspace";
    const argv = try readCommandArgv(allocator, body);
    defer freeArgv(allocator, argv);

    if (argv.len == 0) {
        return failedResult(allocator, "command must not be empty", 400);
    }

    var exec_argv = try std.ArrayList([]const u8).initCapacity(allocator, argv.len + 8);
    defer exec_argv.deinit(allocator);
    try exec_argv.append(allocator, "incus");
    try exec_argv.append(allocator, "exec");
    try exec_argv.append(allocator, instance);
    try exec_argv.append(allocator, "--cwd");
    try exec_argv.append(allocator, workdir);
    try exec_argv.append(allocator, "--");
    for (argv) |part| {
        try exec_argv.append(allocator, part);
    }

    const captured = process_cmd.runCapture(allocator, exec_argv.items) catch {
        return failedResult(allocator, "incus exec failed.", 500);
    };
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    const stdout_json = try jsonStringLiteral(allocator, captured.stdout);
    defer allocator.free(stdout_json);
    const stderr_json = try jsonStringLiteral(allocator, captured.stderr);
    defer allocator.free(stderr_json);
    const failed = !captured.exited_normally or captured.exit_code != 0;

    const response_body = try std.fmt.allocPrint(
        allocator,
        "{{\"failed\":{s},\"rc\":{d},\"stdout\":{s},\"stderr\":{s}}}",
        .{
            if (failed) "true" else "false",
            captured.exit_code,
            stdout_json,
            stderr_json,
        },
    );

    return successResult(allocator, response_body, if (failed) "failed" else "succeeded", if (failed) 500 else 200);
}

/// Collects output globs from a sandbox instance (paths only in this agent build).
///
/// @param allocator Allocator for JSON buffers
/// @param body Collect request JSON
/// @returns JSON response body listing matched paths
pub fn executeCollectTask(allocator: std.mem.Allocator, body: []const u8) !SandboxTaskResult {
    const instance = try readStringField(allocator, body, "instance");
    defer allocator.free(instance);

    const outputs = try readStringArrayField(allocator, body, "outputs");
    defer freeStringArray(allocator, outputs);

    var paths_json = try std.ArrayList(u8).initCapacity(allocator, 32);
    defer paths_json.deinit(allocator);
    try paths_json.appendSlice(allocator, "[");
    for (outputs, 0..) |output, index| {
        if (index > 0) {
            try paths_json.appendSlice(allocator, ",");
        }
        const literal = try jsonStringLiteral(allocator, output);
        defer allocator.free(literal);
        try paths_json.appendSlice(allocator, literal);
    }
    try paths_json.appendSlice(allocator, "]");

    const response_body = try std.fmt.allocPrint(allocator, "{{\"paths\":{s}}}", .{paths_json.items});

    return successResult(allocator, response_body, "collected", 200);
}

/// Stops and deletes a sandbox instance.
///
/// @param allocator Allocator for JSON buffers
/// @param instance Incus instance name from the URL
/// @returns JSON response body
pub fn executeDeleteTask(allocator: std.mem.Allocator, instance: []const u8) !SandboxTaskResult {
    const stop_argv = [_][]const u8{ "incus", "stop", instance, "--force" };
    process_cmd.runCommandVoid(allocator, &stop_argv) catch {};

    const delete_argv = [_][]const u8{ "incus", "delete", instance };
    process_cmd.runCommandVoid(allocator, &delete_argv) catch {};

    const response_body = try std.fmt.allocPrint(allocator, "{{\"instance\":\"{s}\",\"status\":\"destroyed\"}}", .{instance});

    return successResult(allocator, response_body, "destroyed", 200);
}

/// Runs the host bake script for a sandbox parent template.
///
/// @param allocator Allocator for JSON buffers
/// @param body Bake request JSON (`parent`, optional `modulesVolume`, optional `script`)
/// @returns JSON response body
pub fn executeBakeTask(allocator: std.mem.Allocator, body: []const u8) !SandboxTaskResult {
    const parent = try readStringField(allocator, body, "parent");
    defer allocator.free(parent);
    const modules_volume = readOptionalString(body, "modulesVolume") orelse parent;
    const script_path = readOptionalString(body, "script") orelse "/opt/naulite/dogfood/scripts/bake-luckymaker-sandbox.sh";

    const shell_cmd = try std.fmt.allocPrint(
        allocator,
        "NAULITE_SANDBOX_PARENT={s} NAULITE_SANDBOX_MODULES_VOLUME={s} bash {s}",
        .{ parent, modules_volume, script_path },
    );
    defer allocator.free(shell_cmd);

    const bake_argv = [_][]const u8{ "bash", "-lc", shell_cmd };
    process_cmd.runCommandVoid(allocator, &bake_argv) catch {
        return failedResult(allocator, "sandbox bake script failed.", 500);
    };

    const response_body = try std.fmt.allocPrint(
        allocator,
        "{{\"parent\":\"{s}\",\"status\":\"baked\"}}",
        .{parent},
    );

    return successResult(allocator, response_body, "baked", 200);
}

fn successResult(allocator: std.mem.Allocator, body: []const u8, status: []const u8, http_status: u16) !SandboxTaskResult {
    return .{
        .status = try allocator.dupe(u8, status),
        .body = body,
        .error_message = null,
        .http_status = http_status,
    };
}

fn failedResult(allocator: std.mem.Allocator, message: []const u8, http_status: u16) !SandboxTaskResult {
    const message_json = try jsonStringLiteral(allocator, message);
    defer allocator.free(message_json);
    const response_body = try std.fmt.allocPrint(allocator, "{{\"error\":{s}}}", .{message_json});

    return .{
        .status = try allocator.dupe(u8, "failed"),
        .body = response_body,
        .error_message = try allocator.dupe(u8, message),
        .http_status = http_status,
    };
}

fn readStringField(allocator: std.mem.Allocator, body: []const u8, field: []const u8) ![]const u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidSandboxTask;
    }

    const value = root.object.get(field) orelse return error.InvalidSandboxTask;

    if (value != .string or value.string.len == 0) {
        return error.InvalidSandboxTask;
    }

    return try allocator.dupe(u8, value.string);
}

fn readOptionalString(body: []const u8, field: []const u8) ?[]const u8 {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return null;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return null;
    }

    const value = root.object.get(field) orelse return null;

    if (value != .string) {
        return null;
    }

    return value.string;
}

fn readOptionalBool(body: []const u8, field: []const u8) ?bool {
    const parsed = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, body, .{}) catch return null;
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return null;
    }

    const value = root.object.get(field) orelse return null;

    if (value != .bool) {
        return null;
    }

    return value.bool;
}

fn readStringArrayField(allocator: std.mem.Allocator, body: []const u8, field: []const u8) ![][]const u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidSandboxTask;
    }

    const value = root.object.get(field) orelse return error.InvalidSandboxTask;

    if (value != .array) {
        return error.InvalidSandboxTask;
    }

    var items = try std.ArrayList([]const u8).initCapacity(allocator, value.array.items.len);

    for (value.array.items) |entry| {
        if (entry != .string) {
            return error.InvalidSandboxTask;
        }

        try items.append(allocator, try allocator.dupe(u8, entry.string));
    }

    return try items.toOwnedSlice(allocator);
}

fn freeStringArray(allocator: std.mem.Allocator, items: [][]const u8) void {
    for (items) |item| {
        allocator.free(item);
    }
    allocator.free(items);
}

fn readCommandArgv(allocator: std.mem.Allocator, body: []const u8) ![]const []const u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) {
        return error.InvalidSandboxTask;
    }

    const command_value = root.object.get("command") orelse return error.InvalidSandboxTask;

    if (command_value != .array) {
        return error.InvalidSandboxTask;
    }

    var argv = try std.ArrayList([]const u8).initCapacity(allocator, command_value.array.items.len);

    for (command_value.array.items) |entry| {
        if (entry != .string) {
            return error.InvalidSandboxTask;
        }

        try argv.append(allocator, try allocator.dupe(u8, entry.string));
    }

    return try argv.toOwnedSlice(allocator);
}

fn freeArgv(allocator: std.mem.Allocator, argv: []const []const u8) void {
    for (argv) |part| {
        allocator.free(part);
    }
    allocator.free(argv);
}

fn jsonStringLiteral(allocator: std.mem.Allocator, value: []const u8) ![]const u8 {
    var output = try std.ArrayList(u8).initCapacity(allocator, value.len + 2);
    defer output.deinit(allocator);
    try output.append(allocator, '"');

    for (value) |char| {
        switch (char) {
            '"' => try output.appendSlice(allocator, "\\\""),
            '\\' => try output.appendSlice(allocator, "\\\\"),
            '\n' => try output.appendSlice(allocator, "\\n"),
            '\r' => try output.appendSlice(allocator, "\\r"),
            '\t' => try output.appendSlice(allocator, "\\t"),
            else => try output.append(allocator, char),
        }
    }

    try output.append(allocator, '"');
    return try output.toOwnedSlice(allocator);
}
