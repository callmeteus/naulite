import { describe, expect, it } from "vitest";

import type { Node, PipelineEvent, PipelineRun } from "@naulite/sdk";

import {
    collectRunNodeIds,
    hasAgentRelatedRunContent,
    hasUnreachableRunNodes,
    isActivePipelineRun,
    isRunInProgressBanner,
    shouldShowRunAgentUnreachableBanner
} from "../../../packages/ui/packages/frontend/src/utils/runDetailPresentation";

function buildRun(overrides: Partial<PipelineRun> = {}): PipelineRun {
    return {
        id: "minimal-apply",
        kind: "apply",
        status: "running",
        createdAt: "2026-07-31T21:31:15.000Z",
        ...overrides
    };
}

function buildNode(overrides: Partial<Node> = {}): Node {
    return {
        id: "dev-local",
        hostname: "dev-local",
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

describe("runDetailPresentation", () => {
    it("treats awaiting_approval as active for live updates", () => {
        expect(isActivePipelineRun("awaiting_approval")).toBe(true);
        expect(isRunInProgressBanner("awaiting_approval")).toBe(false);
    });

    it("collects node ids from run metadata and steps", () => {
        const run = buildRun({
            nodeId: "node-a",
            steps: [
                {
                    id: "step-1",
                    runId: "minimal-apply",
                    name: "dispatch",
                    order: 0,
                    status: "running",
                    nodeId: "node-b"
                }
            ]
        });

        expect(collectRunNodeIds(run)).toEqual(["node-a", "node-b"]);
    });

    it("detects agent-related run content", () => {
        const run = buildRun({
            errorMessage: "Agent request timed out after 15000ms."
        });

        expect(hasAgentRelatedRunContent(run, [])).toBe(true);
    });

    it("flags unreachable target nodes", () => {
        const nodes = [
            buildNode({ id: "dev-local", status: "offline" })
        ];

        expect(hasUnreachableRunNodes(["dev-local"], nodes)).toBe(true);
    });

    it("shows the banner for failed deploy runs with agent errors", () => {
        const run = buildRun({
            status: "failed",
            failureLog: "fetch failed"
        });

        expect(shouldShowRunAgentUnreachableBanner(run, [buildNode()], [])).toBe(true);
    });

    it("shows the banner when metrics report no reachable agents", () => {
        const run = buildRun({ status: "running" });
        const nodes = [buildNode()];

        expect(shouldShowRunAgentUnreachableBanner(run, nodes, [], {
            agentMetricsReachable: false
        })).toBe(true);
    });

    it("hides the banner for unrelated run kinds", () => {
        const run = buildRun({
            kind: "node_event",
            status: "failed",
            errorMessage: "fetch failed"
        });

        expect(shouldShowRunAgentUnreachableBanner(run, [buildNode()], [])).toBe(false);
    });

    it("hides the banner for successful runs without agent signals", () => {
        const run = buildRun({ status: "succeeded" });
        const events: PipelineEvent[] = [
            {
                id: 1,
                runId: run.id,
                kind: "infra.sync.finished",
                level: "info",
                message: "Infra sync finished minimal",
                metadata: {},
                createdAt: "2026-07-31T21:31:15.000Z"
            }
        ];

        expect(shouldShowRunAgentUnreachableBanner(run, [buildNode()], events)).toBe(false);
    });
});
