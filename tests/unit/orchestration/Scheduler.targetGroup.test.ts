import { Scheduler, TargetGroupService } from "@naulite/control-plane";
import type { ManifestService, Node, Service } from "@naulite/shared";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { TargetGroupResolver } from "../../../packages/control-plane/src/orchestration/TargetGroupResolver";

function buildNode(id: string): Node {
    const now = new Date().toISOString();
    return {
        id,
        hostname: `${id}.local`,
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 100,
            memoryMbTotal: 8192,
            memoryMbUsed: 256,
            diskMbTotal: 102400,
            diskMbUsed: 1024
        },
        agentVersion: "0.1.0",
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now
    };
}

describe("Scheduler.targetGroup", () => {
    const scheduler = new Scheduler();

    beforeEach(() => {
        vi.spyOn(TargetGroupService, "resolveOnlineMemberNodeIds").mockResolvedValue(["node-a", "node-b"]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("pins all replicas to a single target node", async () => {
        const manifestService: ManifestService = {
            placement: { target: "node-a" },
            capabilities: []
        };
        const nodes = [buildNode("node-a"), buildNode("node-b")];
        const eligible = await TargetGroupResolver.resolveEligibleNodes(manifestService, nodes);
        const service = {
            id: "app:web",
            name: "web",
            manifestName: "app",
            image: "nginx",
            desiredReplicas: 2,
            status: "pending",
            capabilities: [],
            networks: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        } satisfies Service;

        const assignments = scheduler.scheduleReplicaNodes(service, manifestService, eligible, 2);

        expect(assignments).toEqual(["node-a", "node-a"]);
    });

    it("spreads replicas across target group members", async () => {
        const manifestService: ManifestService = {
            placement: { targetGroup: "workers" },
            capabilities: []
        };
        const nodes = [buildNode("node-a"), buildNode("node-b")];
        const eligible = await TargetGroupResolver.resolveEligibleNodes(manifestService, nodes);
        const service = {
            id: "app:web",
            name: "web",
            manifestName: "app",
            image: "nginx",
            desiredReplicas: 3,
            status: "pending",
            capabilities: [],
            networks: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        } satisfies Service;

        const assignments = scheduler.scheduleReplicaNodes(service, manifestService, eligible, 3);

        expect(assignments).toEqual(["node-a", "node-b", "node-a"]);
    });

    it("returns no eligible nodes when the target group is empty", async () => {
        vi.spyOn(TargetGroupService, "resolveOnlineMemberNodeIds").mockResolvedValue([]);
        const manifestService: ManifestService = {
            placement: { targetGroup: "empty" },
            capabilities: []
        };
        const eligible = await TargetGroupResolver.resolveEligibleNodes(manifestService, [buildNode("node-a")]);

        expect(eligible).toEqual([]);
    });
});
