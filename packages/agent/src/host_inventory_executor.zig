const logger = @import("logger");

const log_host_inventory = logger.Logger.create("host-inventory");

const std = @import("std");

const host_package_manager = @import("host_package_manager.zig");

/// Result of a host inventory task executed on the agent.
pub const HostInventoryTaskResult = struct {
    status: []const u8,
    body: []const u8,
    error_message: ?[]const u8,
};

/// Executes a host inventory task from the control plane.
pub fn executeHostInventoryTask(allocator: std.mem.Allocator) !HostInventoryTaskResult {
    log_host_inventory.debug("collecting host inventory", .{});

    const inventory = host_package_manager.collectInventory(allocator) catch |err| switch (err) {
        error.UnsupportedOs => {
            return .{
                .status = try allocator.dupe(u8, "failed"),
                .body = try allocator.dupe(u8, "{\"error\":\"unsupported_os\"}"),
                .error_message = try allocator.dupe(u8, "Host package inventory is only supported on Linux."),
            };
        },
        else => return err,
    };
    defer freeInventory(allocator, inventory);

    const body = try host_package_manager.inventoryToJson(allocator, inventory);

    return .{
        .status = try allocator.dupe(u8, "succeeded"),
        .body = body,
        .error_message = null,
    };
}

fn freeInventory(allocator: std.mem.Allocator, inventory: host_package_manager.Inventory) void {
    for (inventory.packages) |entry| {
        allocator.free(entry.name);
        allocator.free(entry.installed_version);
        if (entry.available_version) |version| {
            allocator.free(version);
        }
    }
    allocator.free(inventory.packages);
}
