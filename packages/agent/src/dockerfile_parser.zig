const std = @import("std");

// @todo rename platform prefix after final platform name is chosen
const step_prefix = "# platform:step ";

/// Parsed Dockerfile build step marker.
pub const StepMarker = struct {
    name: []const u8,
    start_line: usize,
    end_line: usize,
};

/// Parses Dockerfile step markers and stage fallbacks.
pub const DockerfileParser = struct {
    /// Parses Dockerfile content into ordered step markers.
    pub fn parseSteps(allocator: std.mem.Allocator, content: []const u8) ![]StepMarker {
        var markers = std.ArrayList(StepMarker).empty;
        errdefer {
            for (markers.items) |marker| {
                allocator.free(marker.name);
            }
            markers.deinit(allocator);
        }

        var step_lines = std.ArrayList(usize).empty;
        defer step_lines.deinit(allocator);

        var names = std.ArrayList([]const u8).empty;
        errdefer {
            for (names.items) |name| {
                allocator.free(name);
            }
            names.deinit(allocator);
        }

        var lines = std.mem.splitScalar(u8, content, '\n');
        var line_number: usize = 0;

        while (lines.next()) |raw_line| {
            line_number += 1;
            const trimmed = std.mem.trim(u8, raw_line, " \t\r");

            if (std.mem.startsWith(u8, trimmed, step_prefix)) {
                const remainder = std.mem.trim(u8, trimmed[step_prefix.len..], " \t\r");
                const name_end = std.mem.indexOfScalar(u8, remainder, ' ') orelse remainder.len;
                const name = try allocator.dupe(u8, remainder[0..name_end]);
                try names.append(allocator, name);
                try step_lines.append(allocator, line_number);
                continue;
            }

            if (names.items.len == 0) {
                const upper = std.ascii.allocUpperString(allocator, trimmed) catch continue;
                defer allocator.free(upper);

                if (std.mem.lastIndexOf(u8, upper, " AS ")) |as_index| {
                    const stage_name = std.mem.trim(u8, trimmed[as_index + 4 ..], " \t\r");
                    if (stage_name.len > 0) {
                        const name = try allocator.dupe(u8, stage_name);
                        try names.append(allocator, name);
                        try step_lines.append(allocator, line_number);
                    }
                }
            }
        }

        if (names.items.len == 0) {
            const name = try allocator.dupe(u8, "docker-build");
            try markers.append(allocator, .{
                .name = name,
                .start_line = 1,
                .end_line = if (line_number == 0) 1 else line_number,
            });
            return try markers.toOwnedSlice(allocator);
        }

        var index: usize = 0;
        while (index < names.items.len) : (index += 1) {
            const start_line = step_lines.items[index];
            const end_line = if (index + 1 < step_lines.items.len)
                step_lines.items[index + 1] - 1
            else
                if (line_number == 0) start_line else line_number;

            try markers.append(allocator, .{
                .name = names.items[index],
                .start_line = start_line,
                .end_line = end_line,
            });
        }

        return try markers.toOwnedSlice(allocator);
    }
};

test "parse platform step comments" {
    const allocator = std.testing.allocator;
    const dockerfile =
        \\FROM node:22
        \\# platform:step pre-build
        \\RUN ./pre-build.sh
        \\# platform:step yarn-install-build
        \\RUN yarn install
    ;

    const steps = try DockerfileParser.parseSteps(allocator, dockerfile);
    defer {
        for (steps) |step| {
            allocator.free(step.name);
        }
        allocator.free(steps);
    }

    try std.testing.expectEqual(@as(usize, 2), steps.len);
    try std.testing.expectEqualStrings("pre-build", steps[0].name);
    try std.testing.expectEqualStrings("yarn-install-build", steps[1].name);
}
