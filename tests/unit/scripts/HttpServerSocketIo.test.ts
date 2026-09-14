import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const httpServerPath = path.join(repoRoot, "packages/agent/src/http_server.zig");

describe("HTTP server POSIX socket I/O", () => {
    it("reads and writes accepted sockets with recv/send, not the Zig Io reader", async () => {
        const source = await readFile(httpServerPath, "utf8");

        expect(source).toContain("c.recv(socket_handle, dest.ptr, dest.len, 0)");
        expect(source).toContain("c.send(socket_handle, data.ptr + offset, data.len - offset, 0)");
        expect(source).not.toContain("readSliceShort");
        expect(source).not.toContain("stream.reader(io, &read_buffer)");
        expect(source).not.toContain("stream.writer(io, &write_buffer)");
    });

    it("clears O_NONBLOCK on every accepted connection, including Linux", async () => {
        const source = await readFile(httpServerPath, "utf8");

        expect(source).toContain("winsock_io.setBlocking(stream.socket.handle)");
        expect(source).toContain("@bitOffsetOf(c.O, \"NONBLOCK\")");
    });
});
