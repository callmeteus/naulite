import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { LeaderElection } from "../../../packages/control-plane/src/services/LeaderElection";
import { MetricsSyncService } from "../../../packages/control-plane/src/services/MetricsSyncService";
import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";

describe("MetricsSyncService", () => {
    let tempDir = "";

    afterEach(async () => {
        if (tempDir) {
            await rm(tempDir, { recursive: true, force: true });
            tempDir = "";
        }
    });

    it("builds scrape targets for online nodes and control plane peers", async () => {
        const store = {
            listNodes: vi.fn(async () => [
                {
                    id: "node-1",
                    hostname: "worker-1",
                    status: "online",
                    agentUrl: "http://agent-1:9100"
                },
                {
                    id: "node-2",
                    hostname: "worker-2",
                    status: "offline",
                    agentUrl: "http://agent-2:9100"
                }
            ])
        } as unknown as ControlPlaneStore;

        const leaderElection = {
            isLeader: () => true
        } as LeaderElection;

        const service = new MetricsSyncService(store, leaderElection, {
            resolveControlPlaneUrls: () => ["http://control-plane-1:8080"]
        });

        const targets = await service.buildTargetGroups();

        expect(targets).toHaveLength(2);
        expect(targets[0]).toEqual({
            targets: ["agent-1:9100"],
            labels: {
                job: "naulite-agent",
                node_id: "node-1",
                hostname: "worker-1"
            }
        });
        expect(targets[1]?.labels.job).toBe("naulite-control-plane");
        expect(targets[1]?.targets).toEqual(["control-plane-1:8080"]);
    });

    it("writes naulite_targets.json only when leader", async () => {
        tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-metrics-sync-"));

        const store = {
            listNodes: vi.fn(async () => [])
        } as unknown as ControlPlaneStore;

        const leaderElection = {
            isLeader: () => true
        } as LeaderElection;

        const service = new MetricsSyncService(store, leaderElection, {
            fileSdDir: tempDir,
            resolveControlPlaneUrls: () => []
        });

        await service.syncIfLeader();

        const contents = await import("node:fs/promises").then((fs) =>
            fs.readFile(path.join(tempDir, "naulite_targets.json"), "utf8")
        );
        expect(JSON.parse(contents)).toEqual([]);

        const followerElection = {
            isLeader: () => false
        } as LeaderElection;
        const follower = new MetricsSyncService(store, followerElection, {
            fileSdDir: tempDir,
            resolveControlPlaneUrls: () => ["http://control-plane-1:8080"]
        });

        await writeFile(path.join(tempDir, "naulite_targets.json"), "[]\n", "utf8");
        await follower.syncIfLeader();

        const afterFollower = await import("node:fs/promises").then((fs) =>
            fs.readFile(path.join(tempDir, "naulite_targets.json"), "utf8")
        );
        expect(JSON.parse(afterFollower)).toEqual([]);
    });
});
