import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const transportPath = path.join(
    repoRoot,
    "packages/agent/src/runtime/docker/docker_transport.zig"
);

describe("docker_transport Windows kernel32 gating", () => {
    it("keeps kernel32 inside a Windows-only comptime struct", async () => {
        const source = await readFile(transportPath, "utf8");

        expect(source).toContain("const platform = if (builtin.os.tag == .windows) struct {");
        expect(source).toContain("const kernel32 = struct {");
        expect(source.indexOf("const platform = if (builtin.os.tag == .windows)")).toBeLessThan(
            source.indexOf("const kernel32 = struct {")
        );
    });

    it("does not share a runtime union of unix and windows_pipe handles", async () => {
        const source = await readFile(transportPath, "utf8");

        expect(source).not.toContain("windows_pipe: HANDLE");
        expect(source).not.toContain(".windows_pipe => |handle| _ = kernel32.CloseHandle(handle),");
    });
});
