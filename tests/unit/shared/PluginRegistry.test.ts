import { describe, expect, it } from "vitest";

import { PluginRegistry } from "@platform/shared";
import type { PluginRegistration } from "@platform/shared";

interface TestPlugin extends PluginRegistration {
    label: string;
}

describe("PluginRegistry", () => {
    it("registers and retrieves a plugin by normalized id", () => {
        const registry = new PluginRegistry<TestPlugin>();
        const plugin: TestPlugin = {
            id: "s3",
            label: "S3 backup destination",
            type: "backupDestination",
            version: "0.1.0"
        };

        registry.register("plugin-s3", plugin);

        const entry = registry.get("s3");
        expect(entry?.id).toBe("s3");
        expect(entry?.plugin.label).toBe("S3 backup destination");
        expect(entry?.directoryName).toBe("plugin-s3");
    });

    it("returns undefined for unknown plugin ids", () => {
        const registry = new PluginRegistry<TestPlugin>();
        expect(registry.get("missing")).toBeUndefined();
    });

    it("lists plugins sorted by id", () => {
        const registry = new PluginRegistry<TestPlugin>();
        registry.register("plugin-b", { id: "b", label: "B", type: "runtime", version: "0.1.0" });
        registry.register("plugin-a", { id: "a", label: "A", type: "runtime", version: "0.1.0" });

        expect(registry.list().map((entry) => entry.id)).toEqual(["a", "b"]);
    });
});
