import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ApiKeyCrypto } from "../../../packages/control-plane/src/auth/ApiKeyCrypto";
import { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";

describe("API key rotation", () => {
    let databasePath = "";

    afterEach(async () => {
        if (databasePath) {
            const provider = new DatabaseProvider();
            await provider.disconnect().catch(() => undefined);
            databasePath = "";
        }
    });

    it("accepts the previous key hash during the grace period", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-api-key-rotation-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });
        await provider.migrate();

        const store = new ControlPlaneStore();
        const created = await store.createApiKey("panel");
        const rotated = await store.rotateApiKey(created.id);

        expect(rotated?.secret).toBeTruthy();

        const previousValid = await store.validateApiKey(created.secret);
        const nextValid = await store.validateApiKey(rotated!.secret);

        expect(previousValid).toBe(true);
        expect(nextValid).toBe(true);

        await provider.disconnect();
    });

    it("returns null when rotating a missing api key", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-api-key-rotation-"));
        databasePath = path.join(tempDir, "control-plane.db");
        const provider = new DatabaseProvider();

        await provider.connect({
            dialect: "sqlite",
            url: `sqlite://${databasePath}`
        });
        await provider.migrate();

        const store = new ControlPlaneStore();
        const rotated = await store.rotateApiKey("missing-id");

        expect(rotated).toBeNull();

        await provider.disconnect();
    });

    it("hashes rotated secrets consistently", () => {
        const secret = "plt_test_secret_value";
        const hash = ApiKeyCrypto.hashSecret(secret);

        expect(ApiKeyCrypto.matches(secret, hash)).toBe(true);
        expect(ApiKeyCrypto.matches("plt_other_secret", hash)).toBe(false);
    });
});
