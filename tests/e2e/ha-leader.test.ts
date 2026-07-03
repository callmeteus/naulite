import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";
import { readFile } from "node:fs/promises";
import path from "node:path";

describe("HA leader election", () => {
    let dockerEnabled = false;

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy(180_000);
        } catch (err) {
            LocalTestCluster.rethrowIfDockerRequired(err);
            dockerEnabled = false;
        }
    }, 300_000);

    afterAll(async () => {
        if (!dockerEnabled) {
            return;
        }

        await LocalTestCluster.stop();
    }, 180_000);

    it("reports a single elected leader across control plane replicas", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const [leaderStatus, followerStatus] = await Promise.all([
            fetch("http://127.0.0.1:18080/cluster/status").then((response) => response.json()),
            fetch("http://127.0.0.1:18081/cluster/status").then((response) => response.json())
        ]) as Array<{ leaderId: string; isLeader: boolean; controlPlaneId: string }>;

        const leaders = [leaderStatus, followerStatus].filter((status) => status.isLeader);
        expect(leaders).toHaveLength(1);
        expect(leaderStatus.leaderId).toBe(followerStatus.leaderId);
    });

    it("rejects apply on a follower control plane instance", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const statuses = await Promise.all([
            fetch("http://127.0.0.1:18080/cluster/status").then((response) => response.json()),
            fetch("http://127.0.0.1:18081/cluster/status").then((response) => response.json())
        ]) as Array<{ isLeader: boolean }>;

        const followerPort = statuses[0]?.isLeader ? "18081" : "18080";
        const manifestYaml = await readFile(
            path.resolve(process.cwd(), "tests/fixtures/manifests/minimal.compose.yml"),
            "utf8"
        );
        const response = await fetch(`http://127.0.0.1:${followerPort}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });

        expect(response.status).toBe(503);
    });
});
