import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const clientPath = path.join(repoRoot, "packages/agent/src/cp_client.zig");

describe("agent control-plane heartbeat loop", () => {
    it("sleeps after a heartbeat failure instead of re-registering immediately", async () => {
        const source = await readFile(clientPath, "utf8");
        const warnIndex = source.indexOf("heartbeat failed:");
        const sleepIndex = source.indexOf("blocking_io.sleepSeconds(5)");

        expect(warnIndex).toBeGreaterThan(-1);
        expect(sleepIndex).toBeGreaterThan(warnIndex);
    });
});
