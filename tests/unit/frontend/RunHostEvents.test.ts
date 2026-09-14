import { describe, expect, it } from "vitest";

import type { Node, PipelineRun } from "@naulite/sdk";

import { aggregateRunHostEvents } from "../../../packages/ui/packages/frontend/src/utils/RunPresentation";

function buildNode(overrides: Partial<Node> = {}): Node {
    return {
        id: "node-a",
        hostname: "worker-a",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 100,
            memoryMbTotal: 1024,
            memoryMbUsed: 128,
            diskMbTotal: 10240,
            diskMbUsed: 512
        },
        agentVersion: "0.0.0",
        agentUrl: "http://127.0.0.1:9470",
        lastHeartbeatAt: "2026-07-31T21:31:15.000Z",
        createdAt: "2026-07-31T21:31:15.000Z",
        updatedAt: "2026-07-31T21:31:15.000Z",
        ...overrides
    };
}

describe("RunHostEvents", () => {
    it("aggregates steps per node and marks failed hosts", () => {
        const run: PipelineRun = {
            id: "run-1",
            kind: "apply",
            status: "failed",
            createdAt: "2026-07-31T21:31:15.000Z",
            steps: [
                {
                    id: "s1",
                    runId: "run-1",
                    name: "on-a",
                    order: 0,
                    status: "succeeded",
                    nodeId: "node-a"
                },
                {
                    id: "s2",
                    runId: "run-1",
                    name: "on-b",
                    order: 1,
                    status: "failed",
                    nodeId: "node-b"
                }
            ]
        };

        const rows = aggregateRunHostEvents(run, [
            buildNode({ id: "node-a", hostname: "worker-a" }),
            buildNode({ id: "node-b", hostname: "worker-b" })
        ]);

        expect(rows).toHaveLength(2);
        expect(rows[0]?.hostname).toBe("worker-a");
        expect(rows[0]?.status).toBe("ok");
        expect(rows[1]?.status).toBe("failed");
        expect(rows[1]?.stepCount).toBe(1);
    });
});
