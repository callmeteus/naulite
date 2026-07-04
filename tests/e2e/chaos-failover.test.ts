import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

describe("chaos failover", () => {
    let dockerEnabled = false;

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy(300_000);
        } catch (err) {
            LocalTestCluster.rethrowIfDockerRequired(err);
            dockerEnabled = false;
        }
    }, 600_000);

    afterAll(async () => {
        if (!dockerEnabled) {
            return;
        }

        await LocalTestCluster.stop();
    }, 180_000);

    it("promotes a new leader after pausing the current leader container", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const leaderPort = await LocalTestCluster.getLeaderPort();
        const leaderInstanceId = leaderPort === 18_080 ? "cp-1" : "cp-2";

        await LocalTestCluster.pauseContainer(leaderInstanceId);

        const newLeaderPort = await LocalTestCluster.waitForNewLeader(90_000, leaderInstanceId);
        expect(newLeaderPort).not.toBe(leaderPort);

        const newLeaderUrl = LocalTestCluster.getControlPlaneUrlForPort(newLeaderPort);
        const readyResponse = await fetch(`${newLeaderUrl}/health/ready`);

        expect(readyResponse.status).toBe(200);
        expect((await readyResponse.json()).ready).toBe(true);

        await LocalTestCluster.unpauseContainer(leaderInstanceId);
    }, 120_000);

    it("serves apply from the promoted leader after leader loss", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const fixturePath = path.resolve(
            process.cwd(),
            "tests/fixtures/manifests/ingress-public.compose.yml"
        );
        const manifestYaml = await readFile(fixturePath, "utf8");
        const leaderPort = await LocalTestCluster.getLeaderPort();
        const leaderInstanceId = leaderPort === 18_080 ? "cp-1" : "cp-2";

        await LocalTestCluster.stopContainer(leaderInstanceId);
        const newLeaderPort = await LocalTestCluster.waitForNewLeader(90_000, leaderInstanceId);
        const newLeaderUrl = LocalTestCluster.getControlPlaneUrlForPort(newLeaderPort);

        const response = await fetch(`${newLeaderUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });

        expect(response.status).toBe(200);
    }, 120_000);
});
