import { describe, expect, it } from "vitest";

import { NodeAgentConnectivityService } from "../../../packages/control-plane/src/services/NodeAgentConnectivityService";

describe("NodeAgentConnectivityService", () => {
    it("treats transport failures and timeouts as unreachable", () => {
        expect(NodeAgentConnectivityService.isAgentUnreachableError({
            code: "AGENT_REQUEST_TIMEOUT",
            statusCode: 504
        })).toBe(true);

        expect(NodeAgentConnectivityService.isAgentUnreachableError({
            code: "AGENT_REQUEST_FAILED",
            statusCode: 503
        })).toBe(true);

        expect(NodeAgentConnectivityService.isAgentUnreachableError({
            code: "AGENT_REQUEST_FAILED",
            statusCode: 502
        })).toBe(true);

        expect(NodeAgentConnectivityService.isAgentUnreachableError({
            code: "AGENT_REQUEST_FAILED",
            statusCode: 504
        })).toBe(true);
    });

    it("does not treat agent HTTP errors as unreachable", () => {
        expect(NodeAgentConnectivityService.isAgentUnreachableError({
            code: "AGENT_REQUEST_FAILED",
            statusCode: 500
        })).toBe(false);
    });

    it("keeps the heartbeat status when the agent health probe would fail", async () => {
        const originalFetch = global.fetch;

        global.fetch = (async () => {
            throw new Error("connection refused");
        }) as typeof fetch;

        const status = await NodeAgentConnectivityService.resolveHeartbeatStatus(
            {
                id: "dev-local",
                hostname: "dev-local",
                status: "online",
                labels: {},
                capabilities: {},
                resources: {
                    cpuMillisTotal: 8000,
                    cpuMillisUsed: 0,
                    memoryMbTotal: 16384,
                    memoryMbUsed: 0,
                    diskMbTotal: 102400,
                    diskMbUsed: 0
                },
                agentVersion: "0.1.0",
                agentUrl: "http://127.0.0.1:9471",
                createdAt: "2026-01-01T00:00:00.000Z",
                updatedAt: "2026-01-01T00:00:00.000Z",
                lastHeartbeatAt: "2026-01-01T00:00:00.000Z"
            },
            "online"
        );

        global.fetch = originalFetch;

        expect(status).toBe("online");
    });
});
