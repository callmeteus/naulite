import type { ExecutionOperation } from "@naulite/shared";
import { describe, expect, it } from "vitest";

import { ApplyService } from "../../../packages/control-plane/src/services/ApplyService";

describe("ApplyService", () => {
    it("filters instance operations to the scheduled node only", () => {
        const operations: ExecutionOperation[] = [
            { type: "ensureVolume", volumeName: "data", mountPath: "/data" },
            { type: "pull", image: "nginx:alpine" },
            { type: "create", instanceId: "minimal:web-1", serviceName: "web", image: "nginx:alpine", command: [], environment: {}, volumes: [], networks: [], ports: [], secrets: [] },
            { type: "start", instanceId: "minimal:web-1" },
            { type: "stop", instanceId: "minimal:api-1" }
        ];
        const instanceNodes = new Map<string, string>([
            ["minimal:web-1", "agent-1"],
            ["minimal:api-1", "agent-2"]
        ]);
        const volumeNodes = new Map<string, string>();

        const agentOneOps = ApplyService.filterOperationsForNode(
            "agent-1",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );
        const agentTwoOps = ApplyService.filterOperationsForNode(
            "agent-2",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );

        expect(agentOneOps.some((op) => op.type === "start" && op.instanceId === "minimal:web-1")).toBe(true);
        expect(agentOneOps.some((op) => op.type === "stop")).toBe(false);
        expect(agentTwoOps.some((op) => op.type === "stop" && op.instanceId === "minimal:api-1")).toBe(true);
        expect(agentTwoOps.some((op) => op.type === "start")).toBe(false);
    });

    it("returns empty plans for idle nodes", () => {
        const operations: ExecutionOperation[] = [
            { type: "start", instanceId: "minimal:web-1" }
        ];
        const instanceNodes = new Map<string, string>([
            ["minimal:web-1", "agent-1"]
        ]);
        const volumeNodes = new Map<string, string>();

        const idleOps = ApplyService.filterOperationsForNode(
            "agent-2",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );

        expect(idleOps).toEqual([]);
    });
});
