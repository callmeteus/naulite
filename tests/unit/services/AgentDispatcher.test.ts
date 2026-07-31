import { describe, expect, it, vi } from "vitest";

import type { ExecutionPlan, Node } from "@naulite/shared";

import { AgentDispatcher } from "../../../packages/control-plane/src/services/AgentDispatcher";

const baseNode: Node = {
    id: "node-1",
    hostname: "agent-1",
    status: "online",
    labels: {},
    capabilities: ["docker"],
    resources: {
        cpuMillisTotal: 1000,
        cpuMillisUsed: 0,
        memoryMbTotal: 1024,
        memoryMbUsed: 0,
        diskMbTotal: 1024,
        diskMbUsed: 0
    },
    agentVersion: "test",
    agentUrl: "http://agent-1:9470",
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

const basePlan: ExecutionPlan = {
    planId: "demo-node-1-1",
    revision: 1,
    nodeId: "node-1",
    manifestName: "demo",
    operations: [{
        type: "pull",
        image: "nginx:alpine"
    }],
    createdAt: new Date().toISOString()
};

describe("AgentDispatcher", () => {
    it("dispatches plans to agents with agentUrl", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ accepted: true }), { status: 202 }));

        const results = await AgentDispatcher.dispatchPlans([basePlan], [baseNode], fetchImpl);

        expect(results).toHaveLength(1);
        expect(results[0]?.status).toBe("dispatched");
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://agent-1:9470/execution/apply",
            expect.objectContaining({ method: "POST" })
        );
    });

    it("skips nodes without agentUrl", async () => {
        const fetchImpl = vi.fn();
        const node = { ...baseNode, agentUrl: undefined };

        const results = await AgentDispatcher.dispatchPlans([basePlan], [node], fetchImpl);

        expect(results[0]?.status).toBe("skipped");
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("marks failed agent responses", async () => {
        const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));

        const results = await AgentDispatcher.dispatchPlans([basePlan], [baseNode], fetchImpl);

        expect(results[0]?.status).toBe("failed");
        expect(results[0]?.httpStatus).toBe(500);
    });

    it("fails when the agent request times out", async () => {
        vi.useFakeTimers();

        const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
            new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener("abort", () => {
                    const error = new Error("Aborted");
                    error.name = "AbortError";
                    reject(error);
                });
            })
        );

        const dispatchPromise = AgentDispatcher.dispatchPlans([basePlan], [baseNode], fetchImpl);
        await vi.advanceTimersByTimeAsync(20_000);

        const results = await dispatchPromise;

        expect(results[0]?.status).toBe("failed");
        expect(results[0]?.message).toContain("timed out");

        vi.useRealTimers();
    });
});
