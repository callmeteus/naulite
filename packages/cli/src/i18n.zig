const std = @import("std");

/// Returns a user-facing CLI string for the given key.
pub fn t(key: []const u8) []const u8 {
    if (std.mem.eql(u8, key, "applySuccess")) {
        return "Manifest applied successfully.";
    }
    if (std.mem.eql(u8, key, "applyFailed")) {
        return "Failed to apply manifest.";
    }
    if (std.mem.eql(u8, key, "nodeNotFound")) {
        return "Node not found.";
    }
    if (std.mem.eql(u8, key, "clusterHealthy")) {
        return "Cluster is healthy.";
    }
    if (std.mem.eql(u8, key, "rollbackSuccess")) {
        return "GitOps rollback completed.";
    }
    if (std.mem.eql(u8, key, "runsListed")) {
        return "Pipeline runs listed.";
    }
    return key;
}

test "i18n resolves known keys" {
    try std.testing.expectEqualStrings("Cluster is healthy.", t("clusterHealthy"));
    try std.testing.expectEqualStrings("missing", t("missing"));
}
