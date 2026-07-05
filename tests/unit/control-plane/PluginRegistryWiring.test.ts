import { describe, expect, it } from "vitest";

import { PluginRegistry } from "@naulite/shared";

import { BackupOrchestrator } from "../../../packages/control-plane/src/modules/backup/BackupOrchestrator";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { PluginRegistryWiring } from "../../../packages/control-plane/src/plugins/PluginRegistryWiring";
describe("PluginRegistryWiring", () => {
    it("registers backup destination providers from the plugin registry", () => {
        const registry = new PluginRegistry();
        const backupOrchestrator = new BackupOrchestrator();

        registry.register("demo", {
            id: "demo",
            type: "backupDestination",
            version: "0.0.1",
            backupDestinationProvider: {
                id: "demo",
                write: async () => ({ location: "demo://archive", sizeBytes: 10 }),
                delete: async () => undefined,
                validate: async () => true
            }
        } as never);

        PluginRegistryWiring.wire({
            pluginRegistry: registry,
            backupOrchestrator
        } as ControlPlaneContext);

        expect(PluginRegistryWiring.listByType(registry, "backupDestination")).toHaveLength(1);
    });
});
