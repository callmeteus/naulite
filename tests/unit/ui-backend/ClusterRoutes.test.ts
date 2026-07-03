import { afterEach, describe, expect, it, vi } from "vitest";

import { PlatformClient } from "../../../packages/sdk/src/PlatformClient";
import { createApp } from "../../../packages/ui/packages/backend/src/App";

/**
 * Builds a mocked control plane client for BFF route tests.
 *
 * @returns Mocked platform client
 */
function createMockControlPlane(): PlatformClient {
    return {
        listNodes: vi.fn(async () => []),
        listBackups: vi.fn(async () => []),
        runBackup: vi.fn(async () => ({
            id: "backup-1",
            volumeName: "data",
            status: "pending"
        })),
        restoreBackup: vi.fn(async () => ({
            id: "backup-1",
            volumeName: "data",
            status: "running"
        })),
        upsertSecret: vi.fn(async () => ({
            id: "secret:db",
            name: "db",
            keys: ["password"],
            scope: "cluster",
            createdAt: "2026-07-02T00:00:00.000Z",
            updatedAt: "2026-07-02T00:00:00.000Z"
        })),
        deleteSecret: vi.fn(async () => undefined),
        getNetBirdTopology: vi.fn(async () => ({ groups: ["app-web"], devices: ["dev-1"] })),
        listNetBirdDevices: vi.fn(async () => [{ id: "dev-1", name: "agent-1" }]),
        listNetBirdGroups: vi.fn(async () => [{ id: "grp-1", name: "app-web" }]),
        listNetBirdAcls: vi.fn(async () => [{ id: "acl-1", name: "default" }]),
        getPrometheusMetrics: vi.fn(async () => "platform_nodes_total 1\n")
    } as unknown as PlatformClient;
}

describe("ui-backend cluster routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.ADMIN_API_KEY;
    });

    it("proxies backup run and restore actions", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const runResponse = await app.inject({
            method: "POST",
            url: "/backups/data/run",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(runResponse.statusCode).toBe(200);
        expect(controlPlane.runBackup).toHaveBeenCalledWith("data");

        const restoreResponse = await app.inject({
            method: "POST",
            url: "/backups/backup-1/restore",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(restoreResponse.statusCode).toBe(200);
        expect(controlPlane.restoreBackup).toHaveBeenCalledWith("backup-1");

        await app.close();
    });

    it("proxies secret upsert and delete actions", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const upsertResponse = await app.inject({
            method: "POST",
            url: "/secrets",
            headers: { authorization: "Bearer secret-key" },
            payload: {
                name: "db",
                data: { password: "secret-value" }
            }
        });
        expect(upsertResponse.statusCode).toBe(200);
        expect(controlPlane.upsertSecret).toHaveBeenCalledWith({
            name: "db",
            data: { password: "secret-value" }
        });

        const deleteResponse = await app.inject({
            method: "DELETE",
            url: "/secrets/db",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(deleteResponse.statusCode).toBe(200);
        expect(controlPlane.deleteSecret).toHaveBeenCalledWith("db");

        await app.close();
    });

    it("proxies NetBird and metrics routes", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const topologyResponse = await app.inject({
            method: "GET",
            url: "/netbird/topology",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(topologyResponse.statusCode).toBe(200);
        expect(topologyResponse.json()).toEqual({ groups: ["app-web"], devices: ["dev-1"] });

        const metricsResponse = await app.inject({
            method: "GET",
            url: "/metrics",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(metricsResponse.statusCode).toBe(200);
        expect(metricsResponse.body).toBe("platform_nodes_total 1\n");

        await app.close();
    });
});
