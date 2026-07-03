import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

describe("LocalTestCluster health smoke", () => {
    let dockerEnabled = false;

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy();
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

    it("returns healthy status from the primary control plane", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const response = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/health`);
        expect(response.ok).toBe(true);

        const body = await response.json() as { status: string };
        expect(body.status).toBe("healthy");
    });

    it("exposes agent health endpoints", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const response = await fetch(`${LocalTestCluster.getAgentUrl("node-a")}/health`);
        expect(response.ok).toBe(true);

        const body = await response.json() as { status: string };
        expect(body.status).toBe("ok");
    });
});
