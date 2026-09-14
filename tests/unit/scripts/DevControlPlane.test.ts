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

/**
 * Returns whether `value` is a plain object.
 *
 * @param value - Unknown parse result
 * @returns `true` when `value` is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Lists `@naulite/*` dependency names from a package.json object.
 *
 * @param packageJson - Parsed package.json
 * @returns Workspace package names
 */
function listNauliteDependencies(packageJson: unknown): string[] {
    if (!isRecord(packageJson)) {
        return [];
    }

    const dependencies = packageJson["dependencies"];

    if (!isRecord(dependencies)) {
        return [];
    }

    return Object.keys(dependencies).filter((name) => {
        return name.startsWith("@naulite/");
    });
}

describe("dev-control-plane build graph", () => {
    it("builds every @naulite control-plane dependency before tsc", async () => {
        const script = await readRepoFile("scripts/dev-control-plane.mjs");
        const packageJson = JSON.parse(await readRepoFile("packages/control-plane/package.json"));
        const workspaceDependencies = listNauliteDependencies(packageJson);

        expect(workspaceDependencies.length).toBeGreaterThan(0);

        for (const name of workspaceDependencies) {
            expect(script, `missing workspace package ${name}`).toContain(`"${name}"`);
        }
    });

    it("compiles provider packages on first start, not only on watch reload", async () => {
        const script = await readRepoFile("scripts/dev-control-plane.mjs");

        expect(script).toContain("buildControlPlane({ includeProviders: true })");
    });

    it("does not pass --parallel to turbo run dev so dependency builds run first", async () => {
        const packageJson = JSON.parse(await readRepoFile("package.json"));

        if (!isRecord(packageJson) || !isRecord(packageJson["scripts"])) {
            throw new Error("package.json scripts is missing");
        }

        const devScript = packageJson["scripts"]["dev"];

        expect(devScript).toBe("turbo run dev");
        expect(String(devScript)).not.toContain("--parallel");
    });

    it("allows Docker-bridge callers and shares a default agent API key", async () => {
        const script = await readRepoFile("scripts/dev-control-plane.mjs");

        expect(script).toContain("NAULITE_ALLOW_DOCKER_BRIDGE ??= \"1\"");
        expect(script).toContain("NAULITE_AGENT_API_KEY ??= DevAgentHelpers.DEFAULT_API_KEY");
        expect(script).toContain("NAULITE_BOOTSTRAP_ADMIN_USERNAME ??= \"admin@example.com\"");
        expect(script).toContain("NAULITE_BOOTSTRAP_ADMIN_PASSWORD ??= \"admin\"");
        expect(script).toContain("Bootstrap login: admin@example.com / admin");
    });
});
