import type { Node } from "@naulite/shared";
import { describe, expect, it, vi } from "vitest";

import { NodeAgentConnectivityWatchdog } from "../../../packages/control-plane/src/services/NodeAgentConnectivityWatchdog";
import { NodeAgentConnectivityService } from "../../../packages/control-plane/src/services/NodeAgentConnectivityService";

function buildNode(overrides: Partial<Node> = {}): Node {
    const now = new Date().toISOString();
    return {
        id: "cloop-host",
        hostname: "cloop-host",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 4000,
            cpuMillisUsed: 0,
            memoryMbTotal: 8192,
            memoryMbUsed: 0,
            diskMbTotal: 102400,
            diskMbUsed: 0
        },
        agentVersion: "0.1.0",
        agentUrl: "http://100.79.236.16:9470",
        lastHeartbeatAt: now,
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("NodeAgentConnectivityWatchdog", () => {
    it("does not mark a fresh heartbeat offline when the health probe fails", async () => {
        const store = {
            listNodes: vi.fn(async () => [buildNode()])
        };

        const probe = vi.spyOn(NodeAgentConnectivityService, "probeAgentHealth").mockResolvedValue(false);
        const markOffline = vi.spyOn(NodeAgentConnectivityService, "markOfflineWhenAgentUnreachable")
            .mockResolvedValue(buildNode({ status: "offline" }));

        const watchdog = new NodeAgentConnectivityWatchdog(store as never);
        await watchdog.sweepAll();

        expect(markOffline).not.toHaveBeenCalled();
        expect(probe).not.toHaveBeenCalled();

        probe.mockRestore();
        markOffline.mockRestore();
    });

    it("marks nodes offline when the heartbeat is stale", async () => {
        const stale = new Date(Date.now() - 120_000).toISOString();
        const store = {
            listNodes: vi.fn(async () => [buildNode({ lastHeartbeatAt: stale })])
        };

        const probe = vi.spyOn(NodeAgentConnectivityService, "probeAgentHealth");
        const markOffline = vi.spyOn(NodeAgentConnectivityService, "markOfflineWhenAgentUnreachable")
            .mockResolvedValue(buildNode({ status: "offline" }));

        const watchdog = new NodeAgentConnectivityWatchdog(store as never);
        await watchdog.sweepAll();

        expect(markOffline).toHaveBeenCalledWith("cloop-host");
        expect(probe).not.toHaveBeenCalled();

        probe.mockRestore();
        markOffline.mockRestore();
    });
});
