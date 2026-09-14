import { Scheduler } from "@naulite/control-plane";
import type { ManifestService, Node, Service } from "@naulite/shared";
import { describe, expect, it } from "vitest";

function buildNode(overrides: Partial<Node> = {}): Node {
    const now = new Date().toISOString();
    return {
        id: "node-a",
        hostname: "node-a.local",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 500,
            memoryMbTotal: 8192,
            memoryMbUsed: 1024,
            diskMbTotal: 102400,
            diskMbUsed: 10240
        },
        agentVersion: "0.1.0",
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

function buildService(overrides: Partial<Service> = {}): Service {
    const now = new Date().toISOString();
    return {
        id: "minimal:web",
        name: "web",
        manifestName: "minimal",
        image: "nginx:1.27-alpine",
        desiredReplicas: 1,
        status: "pending",
        capabilities: ["gpu"],
        networks: [],
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("Scheduler", () => {
    const scheduler = new Scheduler();

    it("selects the highest-scoring node that matches capabilities", () => {
        const service = buildService();
        const manifestService: ManifestService = {
            capabilities: ["gpu"]
        };
        const nodes = [
            buildNode({
                id: "node-a",
                capabilities: ["gpu"],
                resources: {
                    cpuMillisTotal: 4000,
                    cpuMillisUsed: 3500,
                    memoryMbTotal: 8192,
                    memoryMbUsed: 7000,
                    diskMbTotal: 102400,
                    diskMbUsed: 90000
                }
            }),
            buildNode({
                id: "node-b",
                capabilities: ["gpu"],
                resources: {
                    cpuMillisTotal: 4000,
                    cpuMillisUsed: 200,
                    memoryMbTotal: 8192,
                    memoryMbUsed: 256,
                    diskMbTotal: 102400,
                    diskMbUsed: 1024
                }
            })
        ];

        const result = scheduler.schedule(service, manifestService, nodes);

        expect(result?.node.id).toBe("node-b");
        expect(result?.score.matchedCapabilities).toEqual(["gpu"]);
    });

    it("returns null when required capabilities are missing", () => {
        const service = buildService({
            capabilities: ["gpu"]
        });
        const nodes = [
            buildNode({
                capabilities: []
            })
        ];

        const result = scheduler.schedule(service, undefined, nodes);

        expect(result).toBeNull();
        expect(scheduler.scoreAll(service, undefined, nodes)).toEqual([]);
    });

    it("excludes builder-role nodes for runtime image services", () => {
        const service = buildService({
            image: "nginx:1.27-alpine",
            capabilities: ["docker"]
        });
        const manifestService: ManifestService = {
            capabilities: ["docker"]
        };
        const nodes = [
            buildNode({
                id: "agent-builder",
                labels: { role: "builder" },
                capabilities: ["docker"],
                resources: {
                    cpuMillisTotal: 8000,
                    cpuMillisUsed: 100,
                    memoryMbTotal: 16384,
                    memoryMbUsed: 256,
                    diskMbTotal: 204800,
                    diskMbUsed: 1024
                }
            }),
            buildNode({
                id: "agent-worker",
                labels: { role: "worker" },
                capabilities: ["docker"]
            })
        ];

        const result = scheduler.schedule(service, manifestService, nodes);

        expect(result?.node.id).toBe("agent-worker");
    });

    it("spreads replicas round-robin across eligible nodes", () => {
        const service = buildService({ capabilities: [] });
        const nodes = [
            buildNode({ id: "node-a" }),
            buildNode({ id: "node-b" })
        ];

        const assignments = scheduler.scheduleReplicaNodes(service, undefined, nodes, 3);

        expect(assignments).toEqual(["node-a", "node-b", "node-a"]);
    });
});
