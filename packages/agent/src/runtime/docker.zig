const std = @import("std");
const execution_plan = @import("../execution_plan.zig");

pub const DockerClient = struct {
    socket_path: []const u8,
    allocator: std.mem.Allocator,

    pub fn init(allocator: std.mem.Allocator, socket_path: []const u8) DockerClient {
        return .{
            .socket_path = socket_path,
            .allocator = allocator,
        };
    }

    /// Applies an execution plan by dispatching each operation to the Docker API.
    pub fn applyPlan(self: *DockerClient, plan: execution_plan.ExecutionPlan) !void {
        std.log.debug(
            "[docker] apply planId={s} revision={d} operations={d} socket={s}",
            .{ plan.plan_id, plan.revision, plan.operations.len, self.socket_path },
        );

        for (plan.operations) |op| {
            try self.dispatchOperation(op);
        }
    }

    /// Fetches container logs for an instance.
    pub fn getContainerLogs(
        self: *DockerClient,
        instance_id: []const u8,
        tail: ?usize,
    ) ![]const u8 {
        _ = tail;
        std.log.debug("[docker] get logs instanceId={s} socket={s}", .{ instance_id, self.socket_path });
        return try std.fmt.allocPrint(self.allocator, "stub logs for {s}\n", .{instance_id});
    }

    /// Executes a command inside a running container.
    pub fn execContainer(
        self: *DockerClient,
        instance_id: []const u8,
        command: []const []const u8,
    ) !ExecResult {
        std.log.debug("[docker] exec instanceId={s} command_len={d}", .{ instance_id, command.len });
        _ = self;
        return .{
            .exit_code = 0,
            .stdout = "stub stdout",
            .stderr = "",
        };
    }

    fn dispatchOperation(self: *DockerClient, op: execution_plan.ExecutionPlan.Operation) !void {
        std.log.debug("[docker] dispatch type={s}", .{@tagName(op.op_type)});
        _ = self;
        _ = op;
    }
};

pub const ExecResult = struct {
    exit_code: i32,
    stdout: []const u8,
    stderr: []const u8,
};
