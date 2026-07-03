const std = @import("std");

/// Scoped threaded I/O context for synchronous file and network operations.
pub const Scope = struct {
    threaded: std.Io.Threaded,
    io: std.Io,

    /// Initializes a threaded I/O scope backed by the given allocator.
    ///
    /// @param allocator Allocator used for the threaded I/O runtime
    /// @returns Scoped I/O handle
    pub fn init(allocator: std.mem.Allocator) Scope {
        var threaded = std.Io.Threaded.init(allocator, .{});
        return .{
            .threaded = threaded,
            .io = threaded.io(),
        };
    }

    /// Releases threaded I/O resources.
    ///
    /// @param self Scoped I/O handle
    /// @returns Nothing.
    pub fn deinit(self: *Scope) void {
        self.threaded.deinit();
        self.* = undefined;
    }
};
