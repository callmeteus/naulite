import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { PluginLoader } from "../../../packages/control-plane/src/plugins/PluginLoader";
import { PluginRegistry } from "@platform/shared";

describe("PluginLoader", () => {
    let tempDir = "";

    afterEach(async () => {
        if (tempDir) {
            await import("node:fs/promises").then(({ rm }) => rm(tempDir, { recursive: true, force: true }));
            tempDir = "";
        }
    });

    it("discovers plugin default exports from packages/plugins/*/dist/index.js", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-plugin-loader-"));
        const pluginDir = path.join(tempDir, "plugins", "demo-plugin", "dist");
        await mkdir(pluginDir, { recursive: true });
        await writeFile(path.join(pluginDir, "index.js"), `
            export default {
                id: "demo",
                type: "backupDestination",
                version: "0.0.1",
                backupDestinationProvider: {
                    id: "demo",
                    write: async () => ({ location: "demo://x", sizeBytes: 1 }),
                    delete: async () => undefined,
                    validate: async () => true
                }
            };
        `);

        const registry = await new PluginLoader(tempDir).load(new PluginRegistry());

        expect(registry.list()).toHaveLength(1);
        expect(registry.get("demo-plugin")?.plugin.id).toBe("demo");
    });

    it("ignores plugin directories without a built dist entrypoint", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-plugin-loader-"));
        await mkdir(path.join(tempDir, "plugins", "broken-plugin"), { recursive: true });

        const registry = await new PluginLoader(tempDir).load(new PluginRegistry());

        expect(registry.list()).toHaveLength(0);
    });
});
