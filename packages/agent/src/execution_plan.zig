const std = @import("std");

/// Runtime operation kinds dispatched inside an ExecutionPlan.
pub const OperationType = enum {
    pull,
    create,
    start,
    stop,
    remove,
    connectNetwork,
    disconnectNetwork,
    ensureVolume,

    /// Parses an operation type from its JSON string name.
    pub fn fromString(value: []const u8) ?OperationType {
        return std.meta.stringToEnum(OperationType, value);
    }
};

/// Parsed execution plan JSON from the control plane (no YAML on the agent).
pub const ExecutionPlan = struct {
    // Unique plan identifier.
    plan_id: []const u8,

    // Manifest revision number.
    revision: i64,

    // Target node identifier.
    node_id: []const u8,

    // Applied manifest name.
    manifest_name: []const u8,

    // ISO timestamp when the plan was created.
    created_at: []const u8,

    // Ordered runtime operations.
    operations: []const Operation,

    /// Single operation entry inside an execution plan.
    pub const Operation = struct {
        // Operation kind to dispatch.
        op_type: OperationType,

        // Raw JSON payload for the operation.
        raw_json: []const u8,
    };

    /// Releases owned plan strings and operation payloads.
    pub fn deinit(
        self: *ExecutionPlan,
        // The allocator to use.
        allocator: std.mem.Allocator,
    ) void {
        allocator.free(self.plan_id);
        allocator.free(self.node_id);
        allocator.free(self.manifest_name);
        allocator.free(self.created_at);

        for (self.operations) |op| {
            allocator.free(op.raw_json);
        }

        allocator.free(self.operations);
    }
};

/// Parses an ExecutionPlan JSON document from the control plane.
pub fn parseExecutionPlan(
    // The allocator to use.
    allocator: std.mem.Allocator,
    // Raw JSON document body.
    body: []const u8,
) !ExecutionPlan {
    const parsed = try std.json.parseFromSlice(
        std.json.Value,
        allocator,
        body,
        .{},
    );

    defer parsed.deinit();

    const root = parsed.value;

    if (root != .object) {
        return error.InvalidExecutionPlan;
    }

    const plan_id = try duplicateRequiredString(allocator, root, "planId");
    errdefer allocator.free(plan_id);

    const node_id = try duplicateRequiredString(allocator, root, "nodeId");
    errdefer allocator.free(node_id);

    const manifest_name = try duplicateRequiredString(allocator, root, "manifestName");
    errdefer allocator.free(manifest_name);

    const created_at = try duplicateRequiredString(allocator, root, "createdAt");
    errdefer allocator.free(created_at);

    const revision_value = root.object.get("revision") orelse return error.InvalidExecutionPlan;
    const revision: i64 = switch (revision_value) {
        .integer => |n| n,
        .float => |n| @intFromFloat(n),
        else => return error.InvalidExecutionPlan,
    };

    const operations_value = root.object.get("operations") orelse return error.InvalidExecutionPlan;
    if (operations_value != .array) return error.InvalidExecutionPlan;

    const operations = try allocator.alloc(ExecutionPlan.Operation, operations_value.array.items.len);
    errdefer allocator.free(operations);

    for (operations_value.array.items, 0..) |item, index| {
        if (item != .object) return error.InvalidExecutionPlan;

        const type_value = item.object.get("type") orelse return error.InvalidExecutionPlan;
        const type_name = switch (type_value) {
            .string => |s| s,
            else => return error.InvalidExecutionPlan,
        };

        const op_type = OperationType.fromString(type_name) orelse return error.UnknownOperationType;
        const raw_json = try std.json.Stringify.valueAlloc(allocator, item, .{});
        operations[index] = .{
            .op_type = op_type,
            .raw_json = raw_json,
        };
    }

    return .{
        .plan_id = plan_id,
        .revision = revision,
        .node_id = node_id,
        .manifest_name = manifest_name,
        .created_at = created_at,
        .operations = operations,
    };
}

fn duplicateRequiredString(
    allocator: std.mem.Allocator,
    // Parsed JSON root value.
    root: std.json.Value,
    // Required string field name.
    field_name: []const u8,
) ![]u8 {
    if (root != .object) return error.InvalidExecutionPlan;

    const value = root.object.get(field_name) orelse return error.InvalidExecutionPlan;
    return switch (value) {
        .string => |s| try allocator.dupe(u8, s),
        else => error.InvalidExecutionPlan,
    };
}
