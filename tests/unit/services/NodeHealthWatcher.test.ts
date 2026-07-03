import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { Node } from "@platform/shared";
import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { NodeHealthWatcher } from "../../../packages/control-plane/src/services/NodeHealthWatcher";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";

describe("NodeHealthWatcher", () => {
    let databaseProvider: DatabaseProvider;

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
        }
    });

    /**
     * Builds a node fixture for heartbeat tests.
     *
     * @param overrides Partial node overrides
     * @returns Node fixture
     */
    function buildNode(overrides: Partial<Node> = {}): Node {
        return {
            id: "node-1",
            hostname: "worker-1",
            status: "online",
            labels: { pool: "default" },
            capabilities: [],
            resources: {
                cpuMillisTotal: 1000,
                cpuMillisUsed: 100,
                memoryMbTotal: 1024,
                memoryMbUsed: 128,
                diskMbTotal: 1000,
                diskMbUsed: 100
            },
            agentVersion: "0.1.0",
            agentUrl: "http://worker:9470",
            lastHeartbeatAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            ...overrides
        };
    }

    it("emits disk pressure when usage crosses the threshold", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-node-watcher-"));
        const storagePath = path.join(tempDir, "control-plane.db");
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({ dialect: "sqlite", url: `sqlite://${storagePath}` });
        await databaseProvider.migrate();

        await NodeHealthWatcher.onHeartbeat(buildNode({
            resources: {
                cpuMillisTotal: 1000,
                cpuMillisUsed: 100,
                memoryMbTotal: 1024,
                memoryMbUsed: 128,
                diskMbTotal: 1000,
                diskMbUsed: 900
            }
        }));

        const runs = await PipelineRunService.listRuns({ kind: "node_event" });
        expect(runs.items.length).toBeGreaterThan(0);

        const events = await PipelineRunService.listEvents(runs.items[0].id);
        expect(events.some((event) => event.kind === "node.disk_pressure")).toBe(true);
    });
});
