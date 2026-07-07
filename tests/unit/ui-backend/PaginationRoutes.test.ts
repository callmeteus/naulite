import { afterEach, describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";
import { createApp } from "../../../packages/ui/packages/backend/src/App";

describe("ui-backend pagination routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.ADMIN_API_KEY;
    });

    it("returns paginated backups when page query is provided", async () => {
        const controlPlane = {
            listBackupsPaginated: vi.fn(async () => ({
                items: [{ id: "b1", volumeName: "data", status: "succeeded" }],
                total: 1,
                page: 0,
                limit: 20,
                hasMore: false
            }))
        } as unknown as NauliteClient;

        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const response = await app.inject({
            method: "GET",
            url: "/backups?page=1&limit=20",
            headers: { authorization: "Bearer secret-key" }
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().items).toHaveLength(1);
        expect(controlPlane.listBackupsPaginated).toHaveBeenCalledWith({ page: 1, limit: 20 });

        await app.close();
    });

    it("lists node provisions and terminates by id", async () => {
        const controlPlane = {
            listNodeProvisions: vi.fn(async () => ({
                items: [{
                    id: "provision-1",
                    provider: "AWS",
                    status: "bootstrapping",
                    instanceType: "t3.small",
                    amiId: "ami-123",
                    labels: {},
                    capabilities: [],
                    createdAt: "2026-07-02T00:00:00.000Z",
                    updatedAt: "2026-07-02T00:00:00.000Z"
                }],
                total: 1,
                page: 0,
                limit: 10,
                hasMore: false
            })),
            terminateNodeProvision: vi.fn(async () => ({
                id: "provision-1",
                provider: "AWS",
                status: "terminated",
                instanceType: "t3.small",
                amiId: "ami-123",
                labels: {},
                capabilities: [],
                createdAt: "2026-07-02T00:00:00.000Z",
                updatedAt: "2026-07-02T00:00:00.000Z"
            }))
        } as unknown as NauliteClient;

        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const listResponse = await app.inject({
            method: "GET",
            url: "/nodes/provisions?page=1&limit=10",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(listResponse.statusCode).toBe(200);
        expect(controlPlane.listNodeProvisions).toHaveBeenCalled();

        const terminateResponse = await app.inject({
            method: "POST",
            url: "/nodes/provisions/provision-1/terminate",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(terminateResponse.statusCode).toBe(200);
        expect(controlPlane.terminateNodeProvision).toHaveBeenCalledWith("provision-1");

        await app.close();
    });
});
