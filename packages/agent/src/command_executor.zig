const logger = @import("logger");

const log_command = logger.Logger.create("command");

const std = @import("std");

const process_cmd = @import("process_cmd.zig");

/// Result of a host command task executed on the agent.
pub const CommandTaskResult = struct {
    status: []const u8,
    body: []const u8,
    error_message: ?[]const u8,
};

/// Executes a playbook `command` module payload from the control plane.
///
/// @param allocator Allocator for JSON and captured output
/// @param body JSON body with a `command` argv array
/// @returns JSON body with rc, stdout, and stderr
pub fn executeCommandTask(allocator: std.mem.Allocator, body: []const u8) !CommandTaskResult {
    const argv = readCommandArgv(allocator, body) catch |err| {
        log_command.debug("invalid command payload err={s}", .{@errorName(err)});
        return failedResult(allocator, "Invalid command task payload.");
    };
    defer freeArgv(allocator, argv);

    if (argv.len == 0) {
        return failedResult(allocator, "command must not be empty");
    }

    log_command.debug("execute argv0={s} argc={d}", .{ argv[0], argv.len });

    const captured = process_cmd.runCapture(allocator, argv) catch |err| {
        log_command.debug("command spawn failed argv0={s} err={s}", .{ argv[0], @errorName(err) });
        return failedResult(allocator, "Command execution failed.");
    };
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    const failed = !captured.exited_normally or captured.exit_code != 0;
    const stdout_json = try jsonStringLiteral(allocator, captured.stdout);
    defer allocator.free(stdout_json);
    const stderr_json = try jsonStringLiteral(allocator, captured.stderr);
    defer allocator.free(stderr_json);

    const response_body = try std.fmt.allocPrint(
        allocator,
        "{{\"changed\":true,\"failed\":{s},\"rc\":{d},\"stdout\":{s},\"stderr\":{s}}}",
        .{
            if (failed) "true" else "false",
            captured.exit_code,
            stdout_json,
            stderr_json,
        },
    );

    return .{
        .status = try allocator.dupe(u8, if (failed) "failed" else "succeeded"),
        .body = response_body,
        .error_message = null,
    };
}

fn failedResult(allocator: std.mem.Allocator, message: []const u8) !CommandTaskResult {
    const message_json = try jsonStringLiteral(allocator, message);
    defer allocator.free(message_json);
    const response_body = try std.fmt.allocPrint(
        allocator,
        "{{\"changed\":false,\"failed\":true,\"rc\":1,\"stdout\":\"\",\"stderr\":{s}}}",
        .{message_json},
    );

    return .{
        .status = try allocator.dupe(u8, "failed"),
        .body = response_body,
        .error_message = try allocator.dupe(u8, message),
    };
}

fn readCommandArgv(allocator: std.mem.Allocator, body: []const u8) ![]const []const u8 {
    const parsed = try std.json.parseFromSlice(std.json.Value, allocator, body, .{});
    defer parsed.deinit();

    const root = parsed.value;

    if (root != .object) {
        return error.InvalidCommandTask;
    }

    const command_value = root.object.get("command") orelse return error.InvalidCommandTask;

    if (command_value == .string) {
        var argv = try allocator.alloc([]const u8, 3);
        errdefer allocator.free(argv);
        argv[0] = try allocator.dupe(u8, "sh");
        argv[1] = try allocator.dupe(u8, "-c");
        argv[2] = try allocator.dupe(u8, command_value.string);
        return argv;
    }

    if (command_value != .array) {
        return error.InvalidCommandTask;
    }

    var argv = try allocator.alloc([]const u8, command_value.array.items.len);
    errdefer allocator.free(argv);
    var copied: usize = 0;
    errdefer {
        for (argv[0..copied]) |item| {
            allocator.free(item);
        }
    }

    for (command_value.array.items, 0..) |item, index| {
        if (item != .string or item.string.len == 0) {
            return error.InvalidCommandTask;
        }

        argv[index] = try allocator.dupe(u8, item.string);
        copied += 1;
    }

    return argv;
}

fn freeArgv(allocator: std.mem.Allocator, argv: []const []const u8) void {
    for (argv) |item| {
        allocator.free(item);
    }

    allocator.free(argv);
}

fn jsonStringLiteral(allocator: std.mem.Allocator, value: []const u8) ![]const u8 {
    var output: std.ArrayList(u8) = .empty;
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

test "command executor runs echo" {
    const allocator = std.testing.allocator;
    const result = try executeCommandTask(allocator, "{\"command\":[\"/bin/echo\",\"gated-before\"]}");
    defer allocator.free(result.status);
    defer allocator.free(result.body);
    if (result.error_message) |error_message| {
        defer allocator.free(error_message);
    }

    try std.testing.expectEqualStrings("succeeded", result.status);
    try std.testing.expect(std.mem.indexOf(u8, result.body, "gated-before") != null);
    try std.testing.expect(std.mem.indexOf(u8, result.body, "\"failed\":false") != null);
}

test "command executor rejects empty argv" {
    const allocator = std.testing.allocator;
    const result = try executeCommandTask(allocator, "{\"command\":[]}");
    defer allocator.free(result.status);
    defer allocator.free(result.body);
    const error_message = result.error_message orelse return error.TestUnexpectedResult;
    defer allocator.free(error_message);

    try std.testing.expectEqualStrings("failed", result.status);
    try std.testing.expectEqualStrings("command must not be empty", error_message);
}
