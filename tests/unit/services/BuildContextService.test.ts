import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BuildContextService } from "../../../packages/control-plane/src/services/BuildContextService";

describe("BuildContextService", () => {
    it("creates a tarball for a local build context directory", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-build-context-"));
        const contextDir = path.join(tempDir, "ctx");
        await mkdir(contextDir, { recursive: true });
        await writeFile(path.join(contextDir, "Dockerfile"), "FROM nginx:alpine\n");

        const archive = await BuildContextService.createContextArchive(contextDir);
        expect(archive.byteLength).toBeGreaterThan(0);
    });

    it("rejects context paths outside the configured root", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-build-context-"));
        await expect(
            BuildContextService.resolveLocalContextPath(tempDir, "../outside")
        ).rejects.toThrow("escapes the configured context root");
    });
});
