import { afterEach, describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";
import { createApp } from "../../../packages/ui/packages/backend/src/App";

/**
 * Builds a mocked control plane client for host package BFF route tests.
 *
 * @returns Mocked platform client
 */
function createMockControlPlane(): NauliteClient {
    return {
        getNodeHostInventory: vi.fn(async () => ({
            nodeId: "node-1",
            packageManager: "apt",
            packages: [],
            summary: { total: 0, outdated: 0 },
            collectedAt: "2026-07-30T00:00:00.000Z"
        })),
        refreshNodeHostInventory: vi.fn(async () => ({
            nodeId: "node-1",
            packageManager: "apt",
            packages: [],
            summary: { total: 0, outdated: 0 },
            collectedAt: "2026-07-30T00:00:00.000Z"
        })),
        updateNodePackages: vi.fn(async () => ({
            id: "run-1",
            nodeId: "node-1",
            kind: "packages",
            status: "succeeded",
            packages: ["openssl"],
            rebootRequired: false,
            createdAt: "2026-07-30T00:00:00.000Z"
        })),
        updateNodeSystem: vi.fn(async () => ({
            id: "run-2",
            nodeId: "node-1",
            kind: "system",
            status: "succeeded",
            packages: [],
            rebootRequired: true,
            createdAt: "2026-07-30T00:00:00.000Z"
        })),
        listNodeHostUpdates: vi.fn(async () => ({ items: [] }))
    } as unknown as NauliteClient;
}

describe("ui-backend host package routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.ADMIN_API_KEY;
    });

    it("proxies host inventory and update actions", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const inventoryResponse = await app.inject({
            method: "GET",
            url: "/nodes/node-1/host/inventory",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(inventoryResponse.statusCode).toBe(200);
        expect(controlPlane.getNodeHostInventory).toHaveBeenCalledWith("node-1", { refresh: false });

        const refreshResponse = await app.inject({
            method: "POST",
            url: "/nodes/node-1/host/inventory/refresh",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(refreshResponse.statusCode).toBe(200);
        expect(controlPlane.refreshNodeHostInventory).toHaveBeenCalledWith("node-1");

        const packageUpdateResponse = await app.inject({
            method: "POST",
            url: "/nodes/node-1/host/packages/update",
            headers: { authorization: "Bearer secret-key" },
            payload: { packages: ["openssl"] }
        });
        expect(packageUpdateResponse.statusCode).toBe(200);
        expect(controlPlane.updateNodePackages).toHaveBeenCalledWith("node-1", ["openssl"]);

        const systemUpdateResponse = await app.inject({
            method: "POST",
            url: "/nodes/node-1/host/system/update",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(systemUpdateResponse.statusCode).toBe(200);
        expect(controlPlane.updateNodeSystem).toHaveBeenCalledWith("node-1");

        await app.close();
    });
});
