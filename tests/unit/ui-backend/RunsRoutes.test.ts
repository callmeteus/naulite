import { afterEach, describe, expect, it, vi } from "vitest";

import { NauliteClient } from "../../../packages/sdk/src/NauliteClient";
import { createApp } from "../../../packages/ui/packages/backend/src/App";

/**
 * Builds a mocked control plane client for pipeline run route tests.
 *
 * @returns Mocked platform client
 */
function createMockControlPlane(): NauliteClient {
    return {
        listRuns: vi.fn(async () => [{
            id: "api-abc12",
            kind: "ci_build",
            status: "running",
            serviceName: "api",
            createdAt: "2026-07-02T00:00:00.000Z"
        }]),
        getRun: vi.fn(async () => ({
            id: "api-abc12",
            kind: "ci_build",
            status: "running",
            serviceName: "api",
            steps: [],
            events: [],
            createdAt: "2026-07-02T00:00:00.000Z"
        })),
        getRunEvents: vi.fn(async () => [{
            id: 1,
            runId: "api-abc12",
            kind: "build.step.started",
            level: "info",
            message: "build.step.started",
            metadata: {},
            createdAt: "2026-07-02T00:00:00.000Z"
        }]),
        openRunEventStream: vi.fn(async () => new Response(
            "id: 1\ndata: {\"id\":1,\"runId\":\"api-abc12\",\"kind\":\"build.step.started\",\"level\":\"info\",\"message\":\"started\",\"metadata\":{},\"createdAt\":\"2026-07-02T00:00:00.000Z\"}\n\n",
            {
                status: 200,
                headers: {
                    "Content-Type": "text/event-stream"
                }
            }
        ))
    } as unknown as NauliteClient;
}

describe("ui-backend runs routes", () => {
    afterEach(() => {
        vi.clearAllMocks();
        delete process.env.ADMIN_API_KEY;
    });

    it("proxies pipeline run list and detail routes", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const listResponse = await app.inject({
            method: "GET",
            url: "/runs?kind=ci_build&limit=10",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(listResponse.statusCode).toBe(200);
        expect(controlPlane.listRuns).toHaveBeenCalledWith({
            kind: "ci_build",
            limit: 10
        });

        const detailResponse = await app.inject({
            method: "GET",
            url: "/runs/api-abc12",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(detailResponse.statusCode).toBe(200);
        expect(controlPlane.getRun).toHaveBeenCalledWith("api-abc12");

        await app.close();
    });

    it("proxies pipeline run events and stream routes", async () => {
        const controlPlane = createMockControlPlane();
        const app = await createApp({
            adminApiKey: "secret-key",
            logger: false
        });
        app.controlPlane = controlPlane;

        const eventsResponse = await app.inject({
            method: "GET",
            url: "/runs/api-abc12/events?since=0",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(eventsResponse.statusCode).toBe(200);
        expect(controlPlane.getRunEvents).toHaveBeenCalledWith("api-abc12", 0);

        const streamResponse = await app.inject({
            method: "GET",
            url: "/runs/api-abc12/stream",
            headers: { authorization: "Bearer secret-key" }
        });
        expect(streamResponse.statusCode).toBe(200);
        expect(streamResponse.headers["content-type"]).toContain("text/event-stream");
        expect(streamResponse.body).toContain("build.step.started");
        expect(controlPlane.openRunEventStream).toHaveBeenCalledWith("api-abc12");

        await app.close();
    });
});
