const std = @import("std");

const OsTime = c_long;
const OsTm = extern struct {
    tm_sec: i32,
    tm_min: i32,
    tm_hour: i32,
    tm_mday: i32,
    tm_mon: i32,
    tm_year: i32,
    tm_wday: i32,
    tm_yday: i32,
    tm_isdst: i32,
};

extern "c" fn time(timer: ?*OsTime) OsTime;
extern "c" fn localtime(timer: *const OsTime) ?*OsTm;

const SERVICE: []const u8 = "agent";

const Level = enum(u8) {
    @"error" = 0,
    warn = 1,
    info = 2,
    debug = 3,

    fn label(self: Level) []const u8 {
        return @tagName(self);
    }
};

var min_level: Level = .debug;
var io_handle: ?std.Io = null;

/// Initializes the agent logger from environment variables.
pub fn init(io: std.Io) void {
    io_handle = io;
    min_level = resolveLogLevel();
}

/// Agent logger factory matching the Node @naulite/logger contract.
pub const Logger = struct {
    /// Creates a module logger for the agent service.
    pub fn create(comptime module: []const u8) type {
        return ModuleLogger(module);
    }
};

fn ModuleLogger(comptime module: []const u8) type {
    return struct {
        pub fn debug(comptime fmt: []const u8, args: anytype) void {
            writeLog(.debug, module, fmt, args);
        }

        pub fn info(comptime fmt: []const u8, args: anytype) void {
            writeLog(.info, module, fmt, args);
        }

        pub fn warn(comptime fmt: []const u8, args: anytype) void {
            writeLog(.warn, module, fmt, args);
        }

        pub fn err(comptime fmt: []const u8, args: anytype) void {
            writeLog(.@"error", module, fmt, args);
        }
    };
}

fn resolveLogLevel() Level {
    const value = std.c.getenv("NAULITE_LOG_LEVEL") orelse {
        const node_env = std.c.getenv("NODE_ENV") orelse return .debug;
        return if (std.mem.eql(u8, std.mem.span(node_env), "production")) .info else .debug;
    };

    const level_text = std.mem.span(value);
    if (std.mem.eql(u8, level_text, "error")) return .@"error";
    if (std.mem.eql(u8, level_text, "warn")) return .warn;
    if (std.mem.eql(u8, level_text, "info")) return .info;
    if (std.mem.eql(u8, level_text, "debug")) return .debug;

    return .debug;
}

extern "c" fn write(fd: c_int, buf: [*]const u8, count: usize) isize;

fn writeLine(line: []const u8) void {
    _ = write(2, line.ptr, line.len);
}

fn writeLog(comptime level: Level, comptime module: []const u8, comptime fmt: []const u8, args: anytype) void {
    if (@intFromEnum(level) > @intFromEnum(min_level)) {
        return;
    }

    var message_buffer: [4096]u8 = undefined;
    const message = std.fmt.bufPrint(&message_buffer, fmt, args) catch return;

    var timestamp_buffer: [32]u8 = undefined;
    const timestamp = formatTimestamp(&timestamp_buffer) catch return;

    var line_buffer: [4608]u8 = undefined;
    const line = std.fmt.bufPrint(
        &line_buffer,
        "{s} [{s}] [{s}] {s}: {s}\n",
        .{ timestamp, SERVICE, module, level.label(), message },
    ) catch return;

    writeLine(line);
}

fn formatTimestamp(buffer: []u8) ![]const u8 {
    const now = time(null);
    const local = localtime(&now) orelse return error.LocalTimeUnavailable;
    const millis: i32 = if (io_handle) |io|
        @intCast(@mod(std.Io.Clock.real.now(io).toMilliseconds(), 1000))
    else
        0;

    return std.fmt.bufPrint(buffer, "{d:0>4}-{d:0>2}-{d:0>2} {d:0>2}:{d:0>2}:{d:0>2}.{d:0>3}", .{
        @as(i32, @intCast(local.*.tm_year)) + 1900,
        @as(i32, @intCast(local.*.tm_mon)) + 1,
        @as(i32, @intCast(local.*.tm_mday)),
        @as(i32, @intCast(local.*.tm_hour)),
        @as(i32, @intCast(local.*.tm_min)),
        @as(i32, @intCast(local.*.tm_sec)),
        @as(i32, @intCast(millis)),
    });
}

/// Formats a log line using the platform-wide contract. Used by tests.
pub fn formatLogLine(
    allocator: std.mem.Allocator,
    timestamp: []const u8,
    module: []const u8,
    level: Level,
    message: []const u8,
) ![]u8 {
    return std.fmt.allocPrint(
        allocator,
        "{s} [{s}] [{s}] {s}: {s}",
        .{ timestamp, SERVICE, module, level.label(), message },
    );
}

test "formatLogLine matches platform contract" {
    const allocator = std.testing.allocator;
    const line = try formatLogLine(allocator, "2025-07-05 08:27:00.123", "netbird", .info, "enrollment complete");
    defer allocator.free(line);

    try std.testing.expect(std.mem.startsWith(u8, line, "2025-07-05 08:27:00.123 [agent] [netbird] info: "));
}

test "debug is suppressed when min level is warn" {
    const previous = min_level;
    defer min_level = previous;

    min_level = .warn;
    writeLog(.debug, "test", "should not print", .{});
}

test "create returns compatible module logger" {
    const log = Logger.create("cache-test");
    log.info("message value={d}", .{42});
}
