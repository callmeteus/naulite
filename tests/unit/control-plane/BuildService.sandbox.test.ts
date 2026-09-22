import { describe, expect, it } from "vitest";

import { BuildService } from "../../../packages/control-plane/src/services/BuildService";
import type { Node } from "@naulite/shared";

describe("BuildService.resolveSandboxNode", () => {
    const baseNode: Node = {
        id: "n1",
        hostname: "n1",
        status: "online",
        labels: { incusPoolDriver: "zfs" },
        capabilities: ["sandbox"],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 0,
            memoryMbTotal: 4096,
            memoryMbUsed: 0,
            diskMbTotal: 4096,
            diskMbUsed: 0
        },
        agentVersion: "1",
        agentUrl: "http://127.0.0.1:9470",
        lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
    };

    it("returns the first sandbox-capable node with an agent URL", () => {
        const resolved = BuildService.resolveSandboxNode([baseNode]);

        expect(resolved?.id).toBe("n1");
    });

    it("skips dir storage pools", () => {
        const resolved = BuildService.resolveSandboxNode([
            {
                ...baseNode,
                labels: { incusPoolDriver: "dir" }
            }
        ]);

        expect(resolved).toBeUndefined();
    });
});
