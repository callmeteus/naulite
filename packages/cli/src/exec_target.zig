const std = @import("std");

const Client = @import("control_plane_client.zig").Client;
const io_output = @import("io_output.zig");

/// Result of resolving an exec target to an instance id.
pub const Resolution = union(enum) {
    resolved: []const u8,
    not_found: []const u8,
    ambiguous: struct {
        message: []const u8,
        instance_ids: []const []const u8,
    },
};

/// Resolves a CLI exec target against the control plane instance list.
pub fn resolveTarget(
    allocator: std.mem.Allocator,
    // Control plane HTTP client.
    client: *Client,
    // Instance id or service name/id.
    target: []const u8,
) !Resolution {
    const response = try client.get("/instances");
    defer allocator.free(response.body);

    var parsed = try std.json.parseFromSlice(
        []struct {
            id: []const u8,
            serviceId: []const u8,
            serviceName: []const u8,
            status: []const u8,
        },
        allocator,
        response.body,
        .{ .ignore_unknown_fields = true },
    );
    defer parsed.deinit();

    for (parsed.value) |instance| {
        if (std.mem.eql(u8, instance.id, target)) {
            return .{ .resolved = try allocator.dupe(u8, instance.id) };
        }
    }

    var matches: std.ArrayList([]const u8) = .empty;
    errdefer {
        for (matches.items) |instance_id| {
            allocator.free(instance_id);
        }
        matches.deinit(allocator);
    }

    for (parsed.value) |instance| {
        if (!std.mem.eql(u8, instance.status, "running")) {
            continue;
        }

        if (std.mem.eql(u8, instance.serviceName, target) or std.mem.eql(u8, instance.serviceId, target)) {
            try matches.append(allocator, try allocator.dupe(u8, instance.id));
        }
    }

    if (matches.items.len == 0) {
        return .{
            .not_found = try std.fmt.allocPrint(
                allocator,
                "Nenhuma instância em execução encontrada para \"{s}\".",
                .{target},
            ),
        };
    }

    if (matches.items.len == 1) {
        const instance_id = matches.items[0];
        matches.items.len = 0;
        matches.deinit(allocator);
        return .{ .resolved = instance_id };
    }

    const message = try std.fmt.allocPrint(
        allocator,
        "Múltiplas instâncias em execução para \"{s}\". Especifique o id da instância.",
        .{target},
    );

    return .{
        .ambiguous = .{
            .message = message,
            .instance_ids = try matches.toOwnedSlice(allocator),
        },
    };
}

/// Prints a resolution error to stderr.
pub fn printResolutionError(
    allocator: std.mem.Allocator,
    resolution: Resolution,
) !void {
    const stderr = io_output.stderrWriter();

    switch (resolution) {
        .resolved => |instance_id| {
            allocator.free(instance_id);
        },
        .not_found => |message| {
            defer allocator.free(message);
            try stderr.print("{s}\n", .{message});
        },
        .ambiguous => |ambiguous| {
            defer allocator.free(ambiguous.message);
            try stderr.print("{s}\n", .{ambiguous.message});
            for (ambiguous.instance_ids) |instance_id| {
                try stderr.print("  - {s}\n", .{instance_id});
                allocator.free(instance_id);
            }
            allocator.free(ambiguous.instance_ids);
        },
    }
}

test "resolve prefers exact instance id" {
    const allocator = std.testing.allocator;
    const json =
        \\[{"id":"demo:api-1","serviceId":"demo:api","serviceName":"api","status":"running"},{"id":"demo:api-2","serviceId":"demo:api","serviceName":"api","status":"running"}]
    ;

    var parsed = try std.json.parseFromSlice(
        []struct {
            id: []const u8,
            serviceId: []const u8,
            serviceName: []const u8,
            status: []const u8,
        },
        allocator,
        json,
        .{},
    );
    defer parsed.deinit();

    for (parsed.value) |instance| {
        if (std.mem.eql(u8, instance.id, "demo:api-2")) {
            const id = try allocator.dupe(u8, instance.id);
            defer allocator.free(id);
            try std.testing.expectEqualStrings("demo:api-2", id);
        }
    }
}
