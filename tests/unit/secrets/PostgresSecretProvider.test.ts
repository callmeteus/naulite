import type { Secret, SecretUpsertInput } from "@platform/shared";
import { describe, expect, it, vi } from "vitest";

import { PostgresSecretProvider } from "../../../packages/control-plane/src/modules/secrets/PostgresSecretProvider";
import type { SecretsService } from "../../../packages/control-plane/src/services/SecretsService";

/**
 * Builds an in-memory secrets service stub for provider unit tests.
 *
 * @returns Secrets service stub with encrypted-value storage simulation
 */
function createSecretsServiceStub(): SecretsService {
    const metadataByName = new Map<string, Secret>();
    const valuesByName = new Map<string, Record<string, string>>();

    return {
        list: vi.fn(async () => [...metadataByName.values()]),
        upsert: vi.fn(async (input: SecretUpsertInput) => {
            const now = "2026-07-04T00:00:00.000Z";
            const existing = metadataByName.get(input.name);
            const metadata: Secret = {
                id: existing?.id ?? `secret:${input.name}`,
                name: input.name,
                keys: Object.keys(input.data),
                scope: input.scope ?? "cluster",
                serviceName: input.serviceName,
                description: input.description,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now
            };

            metadataByName.set(input.name, metadata);
            valuesByName.set(input.name, { ...input.data });
            return metadata;
        }),
        deleteByName: vi.fn(async (name: string) => metadataByName.delete(name)),
        resolveValues: vi.fn(async (name: string) => valuesByName.get(name) ?? null)
    } as unknown as SecretsService;
}

describe("PostgresSecretProvider", () => {
    it("upserts via provider and resolve returns matching values", async () => {
        const secretsService = createSecretsServiceStub();
        const provider = new PostgresSecretProvider(secretsService);

        const metadata = await provider.upsert({
            name: "db-credentials",
            data: {
                username: "app",
                password: "secret-value"
            },
            scope: "cluster",
            description: "Database credentials"
        });

        expect(metadata.name).toBe("db-credentials");
        expect(metadata.keys).toEqual(["username", "password"]);
        expect(secretsService.upsert).toHaveBeenCalledOnce();

        const resolved = await provider.resolve("db-credentials");
        expect(resolved.data).toEqual({
            username: "app",
            password: "secret-value"
        });
    });

    it("throws when resolving a secret that does not exist", async () => {
        const provider = new PostgresSecretProvider(createSecretsServiceStub());

        await expect(provider.resolve("missing-secret")).rejects.toThrow(
            "Secret not found: missing-secret"
        );
    });
});
