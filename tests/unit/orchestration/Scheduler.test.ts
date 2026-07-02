import { Scheduler } from "@platform/control-plane";
import type { ManifestService, Node, Service } from "@platform/shared";
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
        cluster: {
            labels: {
                region: "us-east"
            }
        },
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("Scheduler", () => {
    const scheduler = new Scheduler();

    it("selects the highest-scoring node that matches labels and capabilities", () => {
        const service = buildService();
        const manifestService: ManifestService = {
            capabilities: ["gpu"],
            cluster: {
                labels: {
                    region: "us-east"
                }
            }
        };
        const nodes = [
            buildNode({
                id: "node-a",
                labels: { region: "us-east" },
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
                labels: { region: "us-east" },
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
        expect(result?.score.matchedLabels).toEqual(["region"]);
        expect(result?.score.matchedCapabilities).toEqual(["gpu"]);
    });

    it("returns null when no node satisfies required labels", () => {
        const service = buildService({
            cluster: {
                labels: {
                    region: "eu-west"
                }
            }
        });
        const nodes = [
            buildNode({
                labels: { region: "us-east" },
                capabilities: ["gpu"]
            })
        ];

        const result = scheduler.schedule(service, undefined, nodes);

        expect(result).toBeNull();
        expect(scheduler.scoreAll(service, undefined, nodes)).toEqual([]);
    });
});
