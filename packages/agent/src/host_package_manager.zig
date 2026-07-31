const logger = @import("logger");

const log_host_pm = logger.Logger.create("host-pm");

const std = @import("std");
const builtin = @import("builtin");

const bootstrap = @import("bootstrap.zig");
const env_util = @import("env_util.zig");
const process_cmd = @import("process_cmd.zig");

/// Supported Linux package manager identifiers.
pub const PackageManager = enum {
    apt,
    dnf,
    yum,
    pacman,
    zypper,

    pub fn tag(self: PackageManager) []const u8 {
        return @tagName(self);
    }
};

/// Package update status on a host node.
pub const PackageStatus = enum {
    up_to_date,
    outdated,

    pub fn jsonTag(self: PackageStatus) []const u8 {
        return switch (self) {
            .up_to_date => "upToDate",
            .outdated => "outdated",
        };
    }
};

/// Single installed package entry on a host node.
pub const PackageEntry = struct {
    name: []const u8,
    installed_version: []const u8,
    available_version: ?[]const u8,
    status: PackageStatus,
};

/// Summary counts for a host inventory snapshot.
pub const InventorySummary = struct {
    total: usize,
    outdated: usize,
};

/// Host package inventory snapshot.
pub const Inventory = struct {
    package_manager: PackageManager,
    packages: []PackageEntry,
    summary: InventorySummary,
};

/// Result of a host update task.
pub const UpdateResult = struct {
    status: []const u8,
    packages: []const []const u8,
    reboot_required: bool,
    stdout: ?[]const u8,
    stderr: ?[]const u8,
    error_message: ?[]const u8,
};

/// Returns true when stub mode is enabled for deterministic tests.
pub fn isStubEnabled() bool {
    var key_buffer: [32]u8 = undefined;
    const key = "NAULITE_HOST_PM_STUB";
    @memcpy(key_buffer[0..key.len], key);
    key_buffer[key.len] = 0;

    const value = std.c.getenv(key_buffer[0..key.len :0]) orelse return false;
    const span = std.mem.span(value);
    return std.mem.eql(u8, span, "1") or std.mem.eql(u8, span, "true");
}

/// Detects the active package manager on Linux hosts.
pub fn detectPackageManager(allocator: std.mem.Allocator) !?PackageManager {
    if (bootstrap.detectOsFamily() != .linux) {
        return null;
    }

    if (isStubEnabled()) {
        return .apt;
    }

    const candidates = [_]struct { cmd: []const u8, manager: PackageManager }{
        .{ .cmd = "apt-get", .manager = .apt },
        .{ .cmd = "dnf", .manager = .dnf },
        .{ .cmd = "yum", .manager = .yum },
        .{ .cmd = "pacman", .manager = .pacman },
        .{ .cmd = "zypper", .manager = .zypper },
    };

    for (candidates) |candidate| {
        if (commandExists(allocator, candidate.cmd)) {
            log_host_pm.debug("detected package manager={s}", .{candidate.manager.tag()});
            return candidate.manager;
        }
    }

    return null;
}

/// Collects the host package inventory.
pub fn collectInventory(allocator: std.mem.Allocator) !Inventory {
    if (bootstrap.detectOsFamily() != .linux) {
        return error.UnsupportedOs;
    }

    if (isStubEnabled()) {
        return try stubInventory(allocator);
    }

    const manager = try detectPackageManager(allocator) orelse return error.UnsupportedOs;

    return switch (manager) {
        .apt => try collectAptInventory(allocator),
        .dnf => try collectDnfInventory(allocator, "dnf"),
        .yum => try collectDnfInventory(allocator, "yum"),
        .pacman => try collectPacmanInventory(allocator),
        .zypper => try collectZypperInventory(allocator),
    };
}

/// Updates selected packages or all upgradable packages.
pub fn updatePackages(
    allocator: std.mem.Allocator,
    packages: []const []const u8,
) !UpdateResult {
    if (bootstrap.detectOsFamily() != .linux) {
        return error.UnsupportedOs;
    }

    if (isStubEnabled()) {
        return try stubPackageUpdate(allocator, packages);
    }

    const manager = try detectPackageManager(allocator) orelse return error.UnsupportedOs;

    return switch (manager) {
        .apt => try updateAptPackages(allocator, packages),
        .dnf => try updateDnfPackages(allocator, "dnf", packages),
        .yum => try updateDnfPackages(allocator, "yum", packages),
        .pacman => try updatePacmanPackages(allocator, packages),
        .zypper => try updateZypperPackages(allocator, packages),
    };
}

/// Performs a full system update.
pub fn updateSystem(allocator: std.mem.Allocator) !UpdateResult {
    if (bootstrap.detectOsFamily() != .linux) {
        return error.UnsupportedOs;
    }

    if (isStubEnabled()) {
        return try stubSystemUpdate(allocator);
    }

    const manager = try detectPackageManager(allocator) orelse return error.UnsupportedOs;

    return switch (manager) {
        .apt => try updateAptSystem(allocator),
        .dnf => try updateDnfSystem(allocator, "dnf"),
        .yum => try updateDnfSystem(allocator, "yum"),
        .pacman => try updatePacmanSystem(allocator),
        .zypper => try updateZypperSystem(allocator),
    };
}

fn commandExists(allocator: std.mem.Allocator, command: []const u8) bool {
    const argv = [_][]const u8{ "which", command };
    const output = process_cmd.runCommand(allocator, &argv) catch return false;
    defer allocator.free(output);
    return output.len > 0;
}

fn stubInventory(allocator: std.mem.Allocator) !Inventory {
    var packages = try allocator.alloc(PackageEntry, 3);
    packages[0] = .{
        .name = try allocator.dupe(u8, "curl"),
        .installed_version = try allocator.dupe(u8, "7.81.0-1"),
        .available_version = try allocator.dupe(u8, "7.81.0-1"),
        .status = .up_to_date,
    };
    packages[1] = .{
        .name = try allocator.dupe(u8, "openssl"),
        .installed_version = try allocator.dupe(u8, "3.0.2-0ubuntu1"),
        .available_version = try allocator.dupe(u8, "3.0.2-0ubuntu1.12"),
        .status = .outdated,
    };
    packages[2] = .{
        .name = try allocator.dupe(u8, "zlib1g"),
        .installed_version = try allocator.dupe(u8, "1:1.2.11.dfsg-2ubuntu9"),
        .available_version = try allocator.dupe(u8, "1:1.2.11.dfsg-2ubuntu9.2"),
        .status = .outdated,
    };

    return .{
        .package_manager = .apt,
        .packages = packages,
        .summary = .{ .total = 3, .outdated = 2 },
    };
}

fn stubPackageUpdate(allocator: std.mem.Allocator, packages: []const []const u8) !UpdateResult {
    const default_packages = [_][]const u8{ "openssl", "zlib1g" };
    const source = if (packages.len > 0) packages else default_packages[0..];
    const updated = try duplicateStringSlice(allocator, source);

    return .{
        .status = try allocator.dupe(u8, "succeeded"),
        .packages = updated,
        .reboot_required = false,
        .stdout = try allocator.dupe(u8, "stub package update completed"),
        .stderr = null,
        .error_message = null,
    };
}

fn stubSystemUpdate(allocator: std.mem.Allocator) !UpdateResult {
    const packages = try allocator.alloc([]const u8, 1);
    packages[0] = try allocator.dupe(u8, "linux-image-generic");

    return .{
        .status = try allocator.dupe(u8, "succeeded"),
        .packages = packages,
        .reboot_required = true,
        .stdout = try allocator.dupe(u8, "stub system update completed"),
        .stderr = null,
        .error_message = null,
    };
}

fn collectAptInventory(allocator: std.mem.Allocator) !Inventory {
    const update_argv = [_][]const u8{ "apt-get", "update", "-qq" };
    process_cmd.runCommandVoid(allocator, &update_argv) catch {};

    const upgradable_argv = [_][]const u8{ "apt", "list", "--upgradable" };
    const upgradable_output = process_cmd.runCommand(allocator, &upgradable_argv) catch {
        return try emptyInventory(allocator, .apt);
    };
    defer allocator.free(upgradable_output);

    const installed_argv = [_][]const u8{ "dpkg-query", "-W", "-f=${Package}\t${Version}\n" };
    const installed_output = process_cmd.runCommand(allocator, &installed_argv) catch {
        return try emptyInventory(allocator, .apt);
    };
    defer allocator.free(installed_output);

    const outdated_map = try parseAptUpgradable(allocator, upgradable_output);
    defer freeStringMap(allocator, outdated_map);

    return try mergeInstalledWithOutdated(allocator, .apt, installed_output, outdated_map, '\t');
}

fn collectDnfInventory(allocator: std.mem.Allocator, command: []const u8) !Inventory {
    const check_argv = [_][]const u8{ command, "check-update", "-q" };
    const check_output = try process_cmd.runCapture(allocator, &check_argv);
    defer allocator.free(check_output.stdout);
    defer allocator.free(check_output.stderr);

    const list_argv = [_][]const u8{ command, "list", "installed" };
    const list_output = process_cmd.runCommand(allocator, &list_argv) catch {
        return try emptyInventory(allocator, if (std.mem.eql(u8, command, "yum")) .yum else .dnf);
    };
    defer allocator.free(list_output);

    const manager: PackageManager = if (std.mem.eql(u8, command, "yum")) .yum else .dnf;
    const outdated_map = try parseDnfCheckUpdate(allocator, check_output.stdout);
    defer freeStringMap(allocator, outdated_map);

    return try mergeInstalledWithOutdated(allocator, manager, list_output, outdated_map, ' ');
}

fn collectPacmanInventory(allocator: std.mem.Allocator) !Inventory {
    const installed_argv = [_][]const u8{ "pacman", "-Q" };
    const installed_output = process_cmd.runCommand(allocator, &installed_argv) catch {
        return try emptyInventory(allocator, .pacman);
    };
    defer allocator.free(installed_output);

    const upgrade_argv = [_][]const u8{ "pacman", "-Qu" };
    const upgrade_output = process_cmd.runCommand(allocator, &upgrade_argv) catch {
        return try mergeInstalledWithOutdated(allocator, .pacman, installed_output, &.{}, ' ');
    };
    defer allocator.free(upgrade_output);

    const outdated_map = try parsePacmanUpgrade(allocator, upgrade_output);
    defer freeStringMap(allocator, outdated_map);

    return try mergeInstalledWithOutdated(allocator, .pacman, installed_output, outdated_map, ' ');
}

fn collectZypperInventory(allocator: std.mem.Allocator) !Inventory {
    const refresh_argv = [_][]const u8{ "zypper", "--non-interactive", "refresh" };
    process_cmd.runCommandVoid(allocator, &refresh_argv) catch {};

    const installed_argv = [_][]const u8{ "rpm", "-qa", "--qf", "%{NAME}\t%{VERSION}-%{RELEASE}\n" };
    const installed_output = process_cmd.runCommand(allocator, &installed_argv) catch {
        return try emptyInventory(allocator, .zypper);
    };
    defer allocator.free(installed_output);

    const updates_argv = [_][]const u8{ "zypper", "list-updates" };
    const updates_output = process_cmd.runCommand(allocator, &updates_argv) catch {
        return try mergeInstalledWithOutdated(allocator, .zypper, installed_output, &.{}, '\t');
    };
    defer allocator.free(updates_output);

    const outdated_map = try parseZypperUpdates(allocator, updates_output);
    defer freeStringMap(allocator, outdated_map);

    return try mergeInstalledWithOutdated(allocator, .zypper, installed_output, outdated_map, '\t');
}

fn updateAptPackages(allocator: std.mem.Allocator, packages: []const []const u8) !UpdateResult {
    const update_argv = [_][]const u8{ "apt-get", "update", "-qq" };
    process_cmd.runCommandVoid(allocator, &update_argv) catch {};

    if (packages.len == 0) {
        const argv = [_][]const u8{ "apt-get", "upgrade", "-y", "-qq" };
        const captured = try process_cmd.runCapture(allocator, &argv);
        defer allocator.free(captured.stdout);
        defer allocator.free(captured.stderr);

        if (!captured.exited_normally or captured.exit_code != 0) {
            return failedUpdate(allocator, captured.stdout, captured.stderr, "apt upgrade failed");
        }

        return successUpdate(allocator, packages, try aptRebootRequired(), captured.stdout, captured.stderr);
    }

    var argv = std.ArrayListUnmanaged([]const u8).empty;
    defer argv.deinit(allocator);
    try argv.append(allocator, "apt-get");
    try argv.append(allocator, "install");
    try argv.append(allocator, "-y");
    try argv.append(allocator, "-qq");
    for (packages) |pkg| {
        try argv.append(allocator, pkg);
    }

    const captured = try process_cmd.runCapture(allocator, argv.items);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "apt install failed");
    }

    const updated = try duplicateStringSlice(allocator, packages);
    return successUpdate(allocator, updated, try aptRebootRequired(), captured.stdout, captured.stderr);
}

fn updateAptSystem(allocator: std.mem.Allocator) !UpdateResult {
    const update_argv = [_][]const u8{ "apt-get", "update", "-qq" };
    process_cmd.runCommandVoid(allocator, &update_argv) catch {};

    const argv = [_][]const u8{ "apt-get", "full-upgrade", "-y", "-qq" };
    const captured = try process_cmd.runCapture(allocator, &argv);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "apt full-upgrade failed");
    }

    const packages = try allocator.alloc([]const u8, 0);
    return successUpdate(allocator, packages, try aptRebootRequired(), captured.stdout, captured.stderr);
}

fn updateDnfPackages(allocator: std.mem.Allocator, command: []const u8, packages: []const []const u8) !UpdateResult {
    if (packages.len == 0) {
        const argv = [_][]const u8{ command, "upgrade", "-y" };
        const captured = try process_cmd.runCapture(allocator, &argv);
        defer allocator.free(captured.stdout);
        defer allocator.free(captured.stderr);

        if (!captured.exited_normally or captured.exit_code != 0) {
            return failedUpdate(allocator, captured.stdout, captured.stderr, "dnf upgrade failed");
        }

        return successUpdate(allocator, packages, try dnfRebootRequired(allocator), captured.stdout, captured.stderr);
    }

    var argv = std.ArrayListUnmanaged([]const u8).empty;
    defer argv.deinit(allocator);
    try argv.append(allocator, command);
    try argv.append(allocator, "install");
    try argv.append(allocator, "-y");
    for (packages) |pkg| {
        try argv.append(allocator, pkg);
    }

    const captured = try process_cmd.runCapture(allocator, argv.items);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "dnf install failed");
    }

    const updated = try duplicateStringSlice(allocator, packages);
    return successUpdate(allocator, updated, try dnfRebootRequired(allocator), captured.stdout, captured.stderr);
}

fn updateDnfSystem(allocator: std.mem.Allocator, command: []const u8) !UpdateResult {
    const argv = [_][]const u8{ command, "upgrade", "-y" };
    const captured = try process_cmd.runCapture(allocator, &argv);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "dnf system upgrade failed");
    }

    const packages = try allocator.alloc([]const u8, 0);
    return successUpdate(allocator, packages, try dnfRebootRequired(allocator), captured.stdout, captured.stderr);
}

fn updatePacmanPackages(allocator: std.mem.Allocator, packages: []const []const u8) !UpdateResult {
    const argv = [_][]const u8{ "pacman", "-Syu", "--noconfirm" };
    const captured = try process_cmd.runCapture(allocator, &argv);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "pacman upgrade failed");
    }

    const updated = try duplicateStringSlice(allocator, packages);
    return successUpdate(allocator, updated, false, captured.stdout, captured.stderr);
}

fn updatePacmanSystem(allocator: std.mem.Allocator) !UpdateResult {
    return updatePacmanPackages(allocator, &.{});
}

fn updateZypperPackages(allocator: std.mem.Allocator, packages: []const []const u8) !UpdateResult {
    if (packages.len == 0) {
        const argv = [_][]const u8{ "zypper", "--non-interactive", "update", "-y" };
        const captured = try process_cmd.runCapture(allocator, &argv);
        defer allocator.free(captured.stdout);
        defer allocator.free(captured.stderr);

        if (!captured.exited_normally or captured.exit_code != 0) {
            return failedUpdate(allocator, captured.stdout, captured.stderr, "zypper update failed");
        }

        return successUpdate(allocator, packages, false, captured.stdout, captured.stderr);
    }

    var argv = std.ArrayListUnmanaged([]const u8).empty;
    defer argv.deinit(allocator);
    try argv.append(allocator, "zypper");
    try argv.append(allocator, "--non-interactive");
    try argv.append(allocator, "install");
    try argv.append(allocator, "-y");
    for (packages) |pkg| {
        try argv.append(allocator, pkg);
    }

    const captured = try process_cmd.runCapture(allocator, argv.items);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "zypper install failed");
    }

    const updated = try duplicateStringSlice(allocator, packages);
    return successUpdate(allocator, updated, false, captured.stdout, captured.stderr);
}

fn updateZypperSystem(allocator: std.mem.Allocator) !UpdateResult {
    const argv = [_][]const u8{ "zypper", "--non-interactive", "dup", "-y" };
    const captured = try process_cmd.runCapture(allocator, &argv);
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);

    if (!captured.exited_normally or captured.exit_code != 0) {
        return failedUpdate(allocator, captured.stdout, captured.stderr, "zypper dup failed");
    }

    const packages = try allocator.alloc([]const u8, 0);
    return successUpdate(allocator, packages, false, captured.stdout, captured.stderr);
}

fn aptRebootRequired() !bool {
    if (builtin.os.tag != .linux) {
        return false;
    }

    const io = @import("blocking_io.zig").io();
    std.Io.Dir.cwd().access(io, "/var/run/reboot-required", .{}) catch return false;
    return true;
}

fn dnfRebootRequired(allocator: std.mem.Allocator) !bool {
    const argv = [_][]const u8{ "needs-restarting", "-r" };
    const captured = process_cmd.runCapture(allocator, &argv) catch return false;
    defer allocator.free(captured.stdout);
    defer allocator.free(captured.stderr);
    return captured.exit_code != 0;
}

fn emptyInventory(allocator: std.mem.Allocator, manager: PackageManager) !Inventory {
    return .{
        .package_manager = manager,
        .packages = try allocator.alloc(PackageEntry, 0),
        .summary = .{ .total = 0, .outdated = 0 },
    };
}

const StringMapEntry = struct { key: []const u8, value: []const u8 };

fn freeStringMap(allocator: std.mem.Allocator, entries: []StringMapEntry) void {
    for (entries) |entry| {
        allocator.free(entry.key);
        allocator.free(entry.value);
    }
    allocator.free(entries);
}

fn parseAptUpgradable(allocator: std.mem.Allocator, output: []const u8) ![]StringMapEntry {
    var entries = std.ArrayListUnmanaged(StringMapEntry).empty;
    errdefer freeStringMap(allocator, entries.items);

    var lines = std.mem.splitScalar(u8, output, '\n');
    while (lines.next()) |line| {
        if (!std.mem.endsWith(u8, line, "[upgradable from:")) {
            if (std.mem.indexOf(u8, line, "/")) |slash| {
                const rest = line[slash + 1 ..];
                if (std.mem.indexOf(u8, rest, " ")) |space| {
                    const name = std.mem.trim(u8, line[0..slash], " ");
                    const version = std.mem.trim(u8, rest[0..space], " ");
                    if (name.len > 0 and version.len > 0) {
                        try entries.append(allocator, .{
                            .key = try allocator.dupe(u8, name),
                            .value = try allocator.dupe(u8, version),
                        });
                    }
                }
            }
            continue;
        }

        const slash = std.mem.indexOf(u8, line, "/") orelse continue;
        const name = std.mem.trim(u8, line[0..slash], " ");
        const version_start = std.mem.indexOf(u8, line, " ") orelse continue;
        const version = std.mem.trim(u8, line[version_start + 1 ..], " ");
        if (name.len == 0 or version.len == 0) {
            continue;
        }

        try entries.append(allocator, .{
            .key = try allocator.dupe(u8, name),
            .value = try allocator.dupe(u8, version),
        });
    }

    return try entries.toOwnedSlice(allocator);
}

fn parseDnfCheckUpdate(allocator: std.mem.Allocator, output: []const u8) ![]StringMapEntry {
    var entries = std.ArrayListUnmanaged(StringMapEntry).empty;
    errdefer freeStringMap(allocator, entries.items);

    var lines = std.mem.splitScalar(u8, output, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0 or std.mem.startsWith(u8, trimmed, "Last metadata")) {
            continue;
        }

        var parts = std.mem.splitScalar(u8, trimmed, ' ');
        const name = parts.next() orelse continue;
        _ = parts.next();
        const version = parts.next() orelse continue;
        if (name.len == 0 or version.len == 0) {
            continue;
        }

        try entries.append(allocator, .{
            .key = try allocator.dupe(u8, name),
            .value = try allocator.dupe(u8, version),
        });
    }

    return try entries.toOwnedSlice(allocator);
}

fn parsePacmanUpgrade(allocator: std.mem.Allocator, output: []const u8) ![]StringMapEntry {
    var entries = std.ArrayListUnmanaged(StringMapEntry).empty;
    errdefer freeStringMap(allocator, entries.items);

    var lines = std.mem.splitScalar(u8, output, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0) {
            continue;
        }

        var parts = std.mem.splitScalar(u8, trimmed, ' ');
        const name = parts.next() orelse continue;
        const version = parts.next() orelse continue;
        if (name.len == 0 or version.len == 0) {
            continue;
        }

        try entries.append(allocator, .{
            .key = try allocator.dupe(u8, name),
            .value = try allocator.dupe(u8, version),
        });
    }

    return try entries.toOwnedSlice(allocator);
}

fn parseZypperUpdates(allocator: std.mem.Allocator, output: []const u8) ![]StringMapEntry {
    var entries = std.ArrayListUnmanaged(StringMapEntry).empty;
    errdefer freeStringMap(allocator, entries.items);

    var lines = std.mem.splitScalar(u8, output, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0 or std.mem.startsWith(u8, trimmed, "Loading") or std.mem.startsWith(u8, trimmed, "Repository")) {
            continue;
        }

        var parts = std.mem.splitScalar(u8, trimmed, '|');
        if (parts.next()) |name_part| {
            const name = std.mem.trim(u8, name_part, " \t");
            if (parts.next()) |installed_part| {
                _ = std.mem.trim(u8, installed_part, " \t");
                if (parts.next()) |available_part| {
                    const available = std.mem.trim(u8, available_part, " \t");
                    if (name.len > 0 and available.len > 0) {
                        try entries.append(allocator, .{
                            .key = try allocator.dupe(u8, name),
                            .value = try allocator.dupe(u8, available),
                        });
                    }
                }
            }
        }
    }

    return try entries.toOwnedSlice(allocator);
}

fn findOutdatedVersion(map: []StringMapEntry, name: []const u8) ?[]const u8 {
    for (map) |entry| {
        if (std.mem.eql(u8, entry.key, name)) {
            return entry.value;
        }
    }
    return null;
}

fn mergeInstalledWithOutdated(
    allocator: std.mem.Allocator,
    manager: PackageManager,
    installed_output: []const u8,
    outdated_map: []StringMapEntry,
    delimiter: u8,
) !Inventory {
    var packages = std.ArrayListUnmanaged(PackageEntry).empty;
    errdefer {
        for (packages.items) |entry| {
            allocator.free(entry.name);
            allocator.free(entry.installed_version);
            if (entry.available_version) |version| {
                allocator.free(version);
            }
        }
        packages.deinit(allocator);
    }

    var outdated_count: usize = 0;
    var lines = std.mem.splitScalar(u8, installed_output, '\n');
    while (lines.next()) |line| {
        const trimmed = std.mem.trim(u8, line, " \t\r");
        if (trimmed.len == 0) {
            continue;
        }

        const delimiter_index = std.mem.indexOfScalar(u8, trimmed, delimiter) orelse continue;
        const name = std.mem.trim(u8, trimmed[0..delimiter_index], " \t");
        const installed_version = std.mem.trim(u8, trimmed[delimiter_index + 1 ..], " \t");
        if (name.len == 0 or installed_version.len == 0) {
            continue;
        }

        const available = findOutdatedVersion(outdated_map, name);
        const status: PackageStatus = if (available != null) .outdated else .up_to_date;
        if (status == .outdated) {
            outdated_count += 1;
        }

        try packages.append(allocator, .{
            .name = try allocator.dupe(u8, name),
            .installed_version = try allocator.dupe(u8, installed_version),
            .available_version = if (available) |version| try allocator.dupe(u8, version) else null,
            .status = status,
        });
    }

    const owned_packages = try packages.toOwnedSlice(allocator);

    return .{
        .package_manager = manager,
        .packages = owned_packages,
        .summary = .{
            .total = owned_packages.len,
            .outdated = outdated_count,
        },
    };
}

fn duplicateStringSlice(allocator: std.mem.Allocator, values: []const []const u8) ![]const []const u8 {
    const copied = try allocator.alloc([]const u8, values.len);
    errdefer {
        for (copied) |value| {
            allocator.free(value);
        }
        allocator.free(copied);
    }

    for (values, 0..) |value, index| {
        copied[index] = try allocator.dupe(u8, value);
    }

    return copied;
}

fn truncateOutput(allocator: std.mem.Allocator, value: []const u8) ![]u8 {
    const max_len = 16 * 1024;
    if (value.len <= max_len) {
        return try allocator.dupe(u8, value);
    }
    return try allocator.dupe(u8, value[0..max_len]);
}

fn successUpdate(
    allocator: std.mem.Allocator,
    packages: []const []const u8,
    reboot_required: bool,
    stdout: []const u8,
    stderr: []const u8,
) !UpdateResult {
    return .{
        .status = try allocator.dupe(u8, "succeeded"),
        .packages = packages,
        .reboot_required = reboot_required,
        .stdout = try truncateOutput(allocator, stdout),
        .stderr = if (stderr.len > 0) try truncateOutput(allocator, stderr) else null,
        .error_message = null,
    };
}

fn failedUpdate(
    allocator: std.mem.Allocator,
    stdout: []const u8,
    stderr: []const u8,
    message: []const u8,
) !UpdateResult {
    return .{
        .status = try allocator.dupe(u8, "failed"),
        .packages = try allocator.alloc([]const u8, 0),
        .reboot_required = false,
        .stdout = if (stdout.len > 0) try truncateOutput(allocator, stdout) else null,
        .stderr = if (stderr.len > 0) try truncateOutput(allocator, stderr) else null,
        .error_message = try allocator.dupe(u8, message),
    };
}

/// Serializes inventory to JSON.
pub fn inventoryToJson(allocator: std.mem.Allocator, inventory: Inventory) ![]u8 {
    var json = std.ArrayListUnmanaged(u8).empty;
    defer json.deinit(allocator);

    try json.appendSlice(allocator, "{\"packageManager\":\"");
    try json.appendSlice(allocator, inventory.package_manager.tag());
    try json.appendSlice(allocator, "\",\"packages\":[");
    for (inventory.packages, 0..) |entry, index| {
        if (index > 0) {
            try json.append(allocator, ',');
        }
        try json.appendSlice(allocator, "{\"name\":\"");
        try appendJsonEscaped(allocator, &json, entry.name);
        try json.appendSlice(allocator, "\",\"installedVersion\":\"");
        try appendJsonEscaped(allocator, &json, entry.installed_version);
        try json.appendSlice(allocator, "\",\"status\":\"");
        try json.appendSlice(allocator, entry.status.jsonTag());
        if (entry.available_version) |available| {
            try json.appendSlice(allocator, "\",\"availableVersion\":\"");
            try appendJsonEscaped(allocator, &json, available);
            try json.append(allocator, '"');
        }
        try json.appendSlice(allocator, "}");
    }

    const summary_suffix = try std.fmt.allocPrint(
        allocator,
        "],\"summary\":{{\"total\":{d},\"outdated\":{d}}}}}",
        .{ inventory.summary.total, inventory.summary.outdated },
    );
    defer allocator.free(summary_suffix);
    try json.appendSlice(allocator, summary_suffix);

    return try json.toOwnedSlice(allocator);
}

/// Serializes update result to JSON.
pub fn updateResultToJson(allocator: std.mem.Allocator, result: UpdateResult) ![]u8 {
    var json = std.ArrayListUnmanaged(u8).empty;
    defer json.deinit(allocator);

    try json.appendSlice(allocator, "{\"status\":\"");
    try json.appendSlice(allocator, result.status);
    try json.appendSlice(allocator, "\",\"packages\":[");
    for (result.packages, 0..) |pkg, index| {
        if (index > 0) {
            try json.append(allocator, ',');
        }
        try json.append(allocator, '"');
        try appendJsonEscaped(allocator, &json, pkg);
        try json.append(allocator, '"');
    }

    if (result.reboot_required) {
        try json.appendSlice(allocator, "],\"rebootRequired\":true");
    } else {
        try json.appendSlice(allocator, "],\"rebootRequired\":false");
    }

    if (result.stdout) |stdout| {
        try json.appendSlice(allocator, ",\"stdout\":\"");
        try appendJsonEscaped(allocator, &json, stdout);
        try json.append(allocator, '"');
    }
    if (result.stderr) |stderr| {
        try json.appendSlice(allocator, ",\"stderr\":\"");
        try appendJsonEscaped(allocator, &json, stderr);
        try json.append(allocator, '"');
    }
    if (result.error_message) |error_message| {
        try json.appendSlice(allocator, ",\"error\":\"");
        try appendJsonEscaped(allocator, &json, error_message);
        try json.appendSlice(allocator, "\"}");
    } else {
        try json.append(allocator, '}');
    }

    return try json.toOwnedSlice(allocator);
}

fn appendJsonEscaped(allocator: std.mem.Allocator, json: *std.ArrayListUnmanaged(u8), value: []const u8) !void {
    for (value) |byte| {
        switch (byte) {
            '"' => try json.appendSlice(allocator, "\\\""),
            '\\' => try json.appendSlice(allocator, "\\\\"),
            '\n' => try json.appendSlice(allocator, "\\n"),
            '\r' => try json.appendSlice(allocator, "\\r"),
            '\t' => try json.appendSlice(allocator, "\\t"),
            else => try json.append(allocator, byte),
        }
    }
}

test "parseAptUpgradable extracts package versions" {
    const allocator = std.testing.allocator;
    const fixture =
        \\Listing...
        \\curl/jammy 7.81.0-1ubuntu1.15 amd64 [upgradable from: 7.81.0-1ubuntu1]
    ;
    const entries = try parseAptUpgradable(allocator, fixture);
    defer freeStringMap(allocator, entries);
    try std.testing.expect(entries.len == 1);
    try std.testing.expectEqualStrings("curl", entries[0].key);
}

test "parseDnfCheckUpdate extracts package versions" {
    const allocator = std.testing.allocator;
    const fixture = "openssl.x86_64 1:3.0.7-1.el9 1:3.0.7-2.el9\n";
    const entries = try parseDnfCheckUpdate(allocator, fixture);
    defer freeStringMap(allocator, entries);
    try std.testing.expect(entries.len == 1);
    try std.testing.expectEqualStrings("openssl.x86_64", entries[0].key);
}

test "stub inventory returns outdated summary" {
    const allocator = std.testing.allocator;
    const inventory = try stubInventory(allocator);
    defer {
        for (inventory.packages) |entry| {
            allocator.free(entry.name);
            allocator.free(entry.installed_version);
            if (entry.available_version) |version| {
                allocator.free(version);
            }
        }
        allocator.free(inventory.packages);
    }
    try std.testing.expectEqual(@as(usize, 3), inventory.summary.total);
    try std.testing.expectEqual(@as(usize, 2), inventory.summary.outdated);
}

test "inventoryToJson includes package manager" {
    const allocator = std.testing.allocator;
    const inventory = try stubInventory(allocator);
    defer {
        for (inventory.packages) |entry| {
            allocator.free(entry.name);
            allocator.free(entry.installed_version);
            if (entry.available_version) |version| {
                allocator.free(version);
            }
        }
        allocator.free(inventory.packages);
    }

    const json = try inventoryToJson(allocator, inventory);
    defer allocator.free(json);
    try std.testing.expect(std.mem.indexOf(u8, json, "\"packageManager\":\"apt\"") != null);
}
