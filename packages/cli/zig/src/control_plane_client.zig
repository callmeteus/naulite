const std = @import("std");

const Config = @import("config.zig").Config;

pub const ApiError = error{
    HttpRequestFailed,
    InvalidResponse,
    ApiError,
};

pub const Response = struct {
    status: u16,
    body: []const u8,
};

pub const Client = struct {
    allocator: std.mem.Allocator,
    config: Config,
    http: std.http.Client,

    /// Creates a control plane HTTP client.
    pub fn init(allocator: std.mem.Allocator, config: Config) Client {
        return .{
            .allocator = allocator,
            .config = config,
            .http = .{ .allocator = allocator },
        };
    }

    /// Releases HTTP client resources.
    pub fn deinit(self: *Client) void {
        self.http.deinit();
    }

    /// Performs a GET request and returns the response body.
    pub fn get(self: *Client, path: []const u8) !Response {
        return self.request("GET", path, null);
    }

    /// Performs a DELETE request.
    pub fn delete(self: *Client, path: []const u8) !Response {
        return self.request("DELETE", path, null);
    }

    /// Performs a POST request with a JSON body.
    pub fn postJson(self: *Client, path: []const u8, body: []const u8) !Response {
        return self.request("POST", path, body);
    }

    /// Performs an HTTP request against the control plane API.
    pub fn request(self: *Client, method: []const u8, path: []const u8, body: ?[]const u8) !Response {
        const url = try std.fmt.allocPrint(
            self.allocator,
            "{s}{s}",
            .{ self.config.base_url, path },
        );
        defer self.allocator.free(url);

        const uri = try std.Uri.parse(url);

        var headers = std.ArrayList(std.http.Header).init(self.allocator);
        defer headers.deinit();

        try headers.append(.{ .name = "Accept", .value = "application/json" });
        if (body != null) {
            try headers.append(.{ .name = "Content-Type", .value = "application/json" });
        }

        var auth_value: ?[]u8 = null;
        defer if (auth_value) |value| self.allocator.free(value);

        if (self.config.token) |token| {
            auth_value = try std.fmt.allocPrint(self.allocator, "Bearer {s}", .{token});
            try headers.append(.{ .name = "Authorization", .value = auth_value.? });
        }

        const owned_headers = try headers.toOwnedSlice();
        defer self.allocator.free(owned_headers);

        const method_enum = std.meta.stringToEnum(std.http.Method, method) orelse return ApiError.HttpRequestFailed;

        var req = try self.http.open(method_enum, uri, .{
            .extra_headers = owned_headers,
        }, .{
            .redirect_behavior = .unhandled,
        });
        defer req.deinit();

        if (body) |payload| {
            try req.send(payload);
        } else {
            try req.send();
        }

        try req.wait();

        var response_body = std.ArrayList(u8).init(self.allocator);
        defer response_body.deinit();

        try req.reader().readAllArrayList(&response_body, 16 * 1024 * 1024);

        const status: u16 = @intCast(req.response.status);

        if (status < 200 or status >= 300) {
            std.log.err("[cli] api status=%d body={s}", .{ status, response_body.items });
            return ApiError.ApiError;
        }

        return .{
            .status = status,
            .body = try self.allocator.dupe(u8, response_body.items),
        };
    }
};
