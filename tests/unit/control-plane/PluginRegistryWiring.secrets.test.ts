import { describe, expect, it } from "vitest";

import { PluginRegistry } from "@platform/shared";

import { LocalSecretProvider } from "../../../packages/control-plane/src/modules/secrets/LocalSecretProvider";
import { PluginSecretProviderAdapter } from "../../../packages/control-plane/src/modules/secrets/PluginSecretProviderAdapter";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { PluginRegistryWiring } from "../../../packages/control-plane/src/plugins/PluginRegistryWiring";
import { SecretProviderRegistry } from "../../../packages/control-plane/src/plugins/SecretProviderRegistry";

describe("PluginRegistryWiring secret providers", () => {
    it("registers secret providers and selects Infisical when configured", () => {
        const registry = new PluginRegistry();
        const secretProviderRegistry = new SecretProviderRegistry();
        const localProvider = new LocalSecretProvider({ masterKey: "test-master-key-material" });
        const infisicalProvider = {
            list: async () => [],
            upsert: async () => ({ id: "secret_db", name: "db", keys: ["password"], scope: "cluster" as const, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }),
            delete: async () => undefined,
            resolve: async () => ({ name: "db", data: { password: "x" } }),
            resolveForAgent: async () => []
        };

        registry.register("infisical-secret-provider", {
            id: "infisical",
            type: "secret",
            version: "0.1.0",
            secretProvider: infisicalProvider
        } as never);

        const previousBackend = process.env.SECRET_BACKEND;
        process.env.SECRET_BACKEND = "infisical";

        const context = {
            pluginRegistry: registry,
            secretProviderRegistry,
            secretProvider: localProvider,
            backupOrchestrator: { register: () => undefined }
        } as unknown as ControlPlaneContext;

        PluginRegistryWiring.wire(context);

        expect(secretProviderRegistry.listIds()).toEqual(["infisical"]);
        expect(context.secretProvider).toBeInstanceOf(PluginSecretProviderAdapter);

        process.env.SECRET_BACKEND = previousBackend;
    });
});
