import { readFile } from "node:fs/promises";
import path from "node:path";

import { NauliteClient } from "@naulite/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const minimalFixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);
const emptyFixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/empty.compose.yml"
);

describe("apply teardown removes services", () => {
    let dockerEnabled = false;
    let client: NauliteClient;
    let controlPlaneUrl = "";

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy();
            controlPlaneUrl = await LocalTestCluster.getLeaderControlPlaneUrl();
            client = new NauliteClient({ baseUrl: controlPlaneUrl });
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

    it("removes the web service after applying an empty manifest", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const minimalYaml = await readFile(minimalFixturePath, "utf8");
        const emptyYaml = await readFile(emptyFixturePath, "utf8");

        const applyResponse = await LocalTestCluster.applyManifest(minimalYaml);
        expect(applyResponse.ok).toBe(true);

        const servicesAfterApply = await client.listServices();
        expect(servicesAfterApply.some((service) => service.name === "web")).toBe(true);

        const teardownResponse = await LocalTestCluster.applyManifest(emptyYaml);
        expect(teardownResponse.ok).toBe(true);

        const teardownBody = await teardownResponse.json() as {
            diff: { servicesToRemove: number };
        };
        expect(teardownBody.diff.servicesToRemove).toBeGreaterThanOrEqual(1);

        const servicesAfterTeardown = await client.listServices();
        expect(servicesAfterTeardown.some((service) => service.name === "web")).toBe(false);
    });
});
