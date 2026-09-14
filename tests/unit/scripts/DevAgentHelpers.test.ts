import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DevAgentHelpers } from "../../../scripts/dev-agent-helpers.mjs";

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

describe("DevAgentHelpers.controlPlaneUrlForDocker", () => {
    it("rewrites loopback hosts to host.docker.internal", () => {
        expect(DevAgentHelpers.controlPlaneUrlForDocker("http://127.0.0.1:18080")).toBe(
            "http://host.docker.internal:18080"
        );
        expect(DevAgentHelpers.controlPlaneUrlForDocker("http://localhost:18080")).toBe(
            "http://host.docker.internal:18080"
        );
        expect(DevAgentHelpers.controlPlaneUrlForDocker("http://[::1]:18080")).toBe(
            "http://host.docker.internal:18080"
        );
    });

    it("keeps a non-loopback control-plane URL unchanged", () => {
        expect(DevAgentHelpers.controlPlaneUrlForDocker("http://192.168.1.10:18080")).toBe(
            "http://192.168.1.10:18080"
        );
        expect(DevAgentHelpers.controlPlaneUrlForDocker("http://cp.internal:18080")).toBe(
            "http://cp.internal:18080"
        );
    });

    it("returns invalid or empty input unchanged", () => {
        expect(DevAgentHelpers.controlPlaneUrlForDocker("not a url")).toBe("not a url");
        expect(DevAgentHelpers.controlPlaneUrlForDocker("")).toBe("");
    });
});

describe("DevAgentHelpers.resolveApiKey", () => {
    it("prefers NAULITE_API_KEY over the control-plane env and the default", () => {
        expect(DevAgentHelpers.resolveApiKey({
            NAULITE_API_KEY: "from-agent",
            NAULITE_AGENT_API_KEY: "from-cp"
        })).toBe("from-agent");
    });

    it("falls back to NAULITE_AGENT_API_KEY then the default key", () => {
        expect(DevAgentHelpers.resolveApiKey({
            NAULITE_AGENT_API_KEY: "from-cp"
        })).toBe("from-cp");
        expect(DevAgentHelpers.resolveApiKey({})).toBe("naulite-dev-agent");
        expect(DevAgentHelpers.resolveApiKey({
            NAULITE_API_KEY: "   "
        })).toBe("naulite-dev-agent");
    });
});

describe("dev-agent Docker startup", () => {
    it("passes the Docker-reachable control-plane URL into compose", async () => {
        const script = await readRepoFile("scripts/dev-agent.mjs");

        expect(script).toContain("NAULITE_CP_URL: DevAgentHelpers.controlPlaneUrlForDocker(controlPlaneUrl)");
        expect(script).toContain("NAULITE_API_KEY: DevAgentHelpers.resolveApiKey(process.env)");
    });

    it("does not throw when the Docker agent health check times out", async () => {
        const script = await readRepoFile("scripts/dev-agent.mjs");

        expect(script).toContain("[dev-agent] Docker agent failed to become healthy:");
        expect(script).toContain("await waitForHealthy(agentHealthUrl, 120_000)");
    });
});
