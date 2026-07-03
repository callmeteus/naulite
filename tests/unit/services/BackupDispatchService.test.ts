import type { Node, Volume } from "@platform/shared";
import { describe, expect, it } from "vitest";

import { BackupDispatchService } from "../../../packages/control-plane/src/services/BackupDispatchService";

describe("BackupDispatchService", () => {
    const nodes: Node[] = [
        {
            id: "node-a",
            hostname: "agent-a",
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
            agentVersion: "0.1.0",
            agentUrl: "http://agent-a:9470",
            lastHeartbeatAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        },
        {
            id: "node-b",
            hostname: "agent-b",
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
            agentVersion: "0.1.0",
            agentUrl: "http://agent-b:9470",
            lastHeartbeatAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }
    ];

    it("resolves the node assigned to a volume before falling back", () => {
        const volume: Volume = {
            id: "minimal:data",
            name: "data",
            manifestName: "minimal",
            scope: "cluster",
            mountPath: "/var/lib/platform/minimal/data",
            status: "ready",
            nodeId: "node-b",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        expect(BackupDispatchService.resolveNodeForVolume(volume, nodes)?.id).toBe("node-b");
    });

    it("builds a backup payload with policy metadata", () => {
        const volume: Volume = {
            id: "minimal:data",
            name: "data",
            manifestName: "minimal",
            scope: "cluster",
            mountPath: "/var/lib/platform/minimal/data",
            status: "ready",
            nodeId: "node-a",
            backup: {
                schedule: "0 3 * * *",
                includes: ["data/**"],
                excludes: ["data/tmp/**"],
                destination: {
                    provider: "local",
                    path: "/var/lib/platform/backups"
                }
            },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const payload = BackupDispatchService.buildTaskPayload(volume, "task-1");

        expect(payload.taskId).toBe("task-1");
        expect(payload.includes).toEqual(["data/**"]);
        expect(payload.excludes).toEqual(["data/tmp/**"]);
        expect(payload.destination.provider).toBe("local");
    });
});
