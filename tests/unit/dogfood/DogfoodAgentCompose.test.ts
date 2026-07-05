import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const agentDockerfilePath = path.resolve(import.meta.dirname, "../../../packages/agent/Dockerfile");

describe("agent Dockerfile NetBird host dependencies", () => {
    it("installs coreutils so the NetBird CLI can run uname", async () => {
        const dockerfile = await readFile(agentDockerfilePath, "utf8");
        expect(dockerfile).toMatch(/coreutils/);
    });

    it("sets a full PATH for the NetBird CLI host utilities", async () => {
        const dockerfile = await readFile(agentDockerfilePath, "utf8");
        expect(dockerfile).toContain('ENV PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"');
    });

    it("does not gate NetBird host dependencies behind an optional build arg", async () => {
        const dockerfile = await readFile(agentDockerfilePath, "utf8");
        expect(dockerfile).not.toContain("INSTALL_NETBIRD_HOST_DEPS");
    });
});
