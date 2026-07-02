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
    io: std.Io,
    config: Config,
    http: std.http.Client,

    /// Creates a control plane HTTP client.
    pub fn init(allocator: std.mem.Allocator, io: std.Io, config: Config) Client {
        return .{
            .allocator = allocator,
            .io = io,
            .config = config,
            .http = .{ .allocator = allocator, .io = io },
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
        const method_enum = std.meta.stringToEnum(std.http.Method, method) orelse return ApiError.HttpRequestFailed;

        var extra_headers: [4]std.http.Header = undefined;
        var header_count: usize = 0;

        extra_headers[header_count] = .{ .name = "Accept", .value = "application/json" };
        header_count += 1;

        if (body != null) {
            extra_headers[header_count] = .{ .name = "Content-Type", .value = "application/json" };
            header_count += 1;
        }

        var auth_value: ?[]u8 = null;
        defer if (auth_value) |value| self.allocator.free(value);

        if (self.config.token) |token| {
            auth_value = try std.fmt.allocPrint(self.allocator, "Bearer {s}", .{token});
            extra_headers[header_count] = .{ .name = "Authorization", .value = auth_value.? };
            header_count += 1;
        }

        const response_buffer = try self.allocator.alloc(u8, 16 * 1024 * 1024);
        defer self.allocator.free(response_buffer);

        var response_writer = std.Io.Writer.fixed(response_buffer);

        const result = std.http.Client.fetch(&self.http, .{
            .location = .{ .uri = uri },
            .method = method_enum,
            .payload = body,
            .extra_headers = extra_headers[0..header_count],
            .response_writer = &response_writer,
        }) catch {
            return ApiError.HttpRequestFailed;
        };

        const status: u16 = @intFromEnum(result.status);

        if (status < 200 or status >= 300) {
            std.log.err("[cli] api status={d} body={s}", .{ status, response_writer.buffered() });
            return ApiError.ApiError;
        }

        return .{
            .status = status,
            .body = try self.allocator.dupe(u8, response_writer.buffered()),
        };
    }
};
