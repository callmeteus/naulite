import { describe, expect, it, vi } from "vitest";

import { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { SecretsService } from "../../../packages/control-plane/src/services/SecretsService";

describe("SecretsService", () => {
    it("encrypts secret values at rest and resolves them for internal use", async () => {
        const store = {
            listSecrets: vi.fn(async () => []),
            upsertClusterSecret: vi.fn(async () => undefined),
            deleteSecretByName: vi.fn(async () => true)
        } as unknown as ControlPlaneStore;
        const service = new SecretsService(store, "test-master-key");

        const metadata = await service.upsert({
            name: "db-credentials",
            data: {
                username: "app",
                password: "secret-value"
            }
        });

        expect(metadata.name).toBe("db-credentials");
        expect(metadata.keys).toEqual(["username", "password"]);
        expect(store.upsertClusterSecret).toHaveBeenCalledWith(expect.objectContaining({
            name: "db-credentials",
            value: expect.objectContaining({
                __encrypted: expect.any(String)
            })
        }));
    });
});
