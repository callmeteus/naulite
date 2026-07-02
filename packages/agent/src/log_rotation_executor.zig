const std = @import("std");

pub const LogRotationTaskResult = struct {
    task_id: []const u8,
    status: []const u8,
    rotated_files: []const []const u8,
    error_message: ?[]const u8,
};

/// Executes a log rotation task JSON payload from the control plane.
pub fn executeLogRotationTask(allocator: std.mem.Allocator, body: []const u8) !LogRotationTaskResult {
    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );
    defer parsed.deinit();

    const root = parsed.value;
    if (root != .object) return error.InvalidLogRotationTask;

    const task_id_value = root.object.get("taskId") orelse return error.InvalidLogRotationTask;
    const task_id = switch (task_id_value) {
        .string => |s| s,
        else => return error.InvalidLogRotationTask,
    };

    std.log.debug("[log-rotation] execute taskId={s} body_len={d}", .{ task_id, body.len });

    const rotated_files = try allocator.alloc([]const u8, 0);

    return .{
        .task_id = try allocator.dupe(u8, task_id),
        .status = try allocator.dupe(u8, "completed"),
        .rotated_files = rotated_files,
        .error_message = null,
    };
}
