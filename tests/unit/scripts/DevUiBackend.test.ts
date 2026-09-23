import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Reads a UTF-8 file relative to the repository root.
 *
 * @param relativePath - Path from the naulite repo root
 * @returns File contents
 */
async function readRepoFile(relativePath: string): Promise<string> {
    return readFile(path.join(repoRoot, relativePath), "utf8");
}

describe("dev-ui-backend resilient dev", () => {
    it("does not exit the dev process when TypeScript build fails", async () => {
        const script = await readRepoFile("scripts/dev-ui-backend.mjs");

        expect(script).toContain("runCommand");
        expect(script).toContain("admin API build failed; fix TypeScript errors and save to retry");
        expect(script).toContain("keeping the previous server until the next successful build");
        expect(script).not.toContain("process.exit(result.status");
    });
});
