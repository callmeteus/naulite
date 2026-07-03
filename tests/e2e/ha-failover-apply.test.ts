import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/ingress-public.compose.yml"
);

const instanceIdForPort: Record<number, string> = {
    18_080: "cp-1",
    18_081: "cp-2"
};

describe("HA failover during apply", () => {
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

    it("completes apply on the promoted leader after killing the leader mid-flight", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const leaderPort = await LocalTestCluster.getLeaderPort();
        const leaderInstanceId = instanceIdForPort[leaderPort];
        const leaderUrl = LocalTestCluster.getControlPlaneUrlForPort(leaderPort);
        const manifestYaml = await readFile(fixturePath, "utf8");

        const applyPromise = fetch(`${leaderUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });

        await LocalTestCluster.stopContainer(leaderInstanceId);

        await applyPromise.catch(() => undefined);

        const newLeaderPort = await LocalTestCluster.waitForNewLeader(90_000, leaderInstanceId);
        expect(newLeaderPort).not.toBe(leaderPort);

        const newLeaderUrl = LocalTestCluster.getControlPlaneUrlForPort(newLeaderPort);
        const retryResponse = await fetch(`${newLeaderUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(retryResponse.ok).toBe(true);

        const status = await LocalTestCluster.fetchClusterStatus(newLeaderPort);
        expect(status.summary?.runningInstances ?? 0).toBeGreaterThan(0);

        const routesResponse = await fetch(`${newLeaderUrl}/gateway/routes`);
        expect(routesResponse.ok).toBe(true);

        const routes = await routesResponse.json() as Array<{
            serviceName: string;
            host: string;
        }>;
        expect(routes.some((route) => route.serviceName === "web" && route.host === "web.test.local")).toBe(true);

        const traefikConfigResponse = await fetch(`${LocalTestCluster.getTraefikMockUrl()}/last-config`);
        expect(traefikConfigResponse.ok).toBe(true);

        const traefikConfig = await traefikConfigResponse.json() as {
            http?: { routers?: Record<string, unknown> };
        };
        expect(Object.keys(traefikConfig.http?.routers ?? {}).length).toBeGreaterThan(0);
    });
});
