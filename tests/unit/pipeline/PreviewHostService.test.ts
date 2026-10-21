import { describe, expect, it } from "vitest";

import type { Node } from "@naulite/shared";

import { PreviewHostService } from "../../../packages/control-plane/src/services/pipeline/PreviewHostService";

function nodeFixture(overrides: Partial<Node>): Node {
    const now = new Date().toISOString();

    return {
        id: "node-1",
        hostname: "host",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 0,
            memoryMbTotal: 1024,
            memoryMbUsed: 0,
            diskMbTotal: 1024,
            diskMbUsed: 0
        },
        agentVersion: "0.0.0",
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("PreviewHostService", () => {
    it("builds stable preview host names", () => {
        expect(PreviewHostService.serviceNameForBranch("EVEN-1234")).toBe("lm-even-1234");
        expect(PreviewHostService.hostnameForBranch("EVEN-1234", "lm.local.arpa")).toBe("even-1234.lm.local.arpa");
    });

    it("ignores non-task branches", () => {
        expect(PreviewHostService.branchToSlug("master")).toBeUndefined();
    });

    it("finds online preview nodes by preview_branch label", () => {
        const nodes = [
            nodeFixture({
                id: "offline",
                status: "offline",
                labels: { preview_branch: "even-1" }
            }),
            nodeFixture({
                id: "match",
                labels: { preview_branch: "even-1234" }
            })
        ];

        expect(PreviewHostService.findOnlinePreviewNode(nodes, "even-1234")?.id).toBe("match");
        expect(PreviewHostService.findOnlinePreviewNode(nodes, "even-9999")).toBeUndefined();
    });
});
