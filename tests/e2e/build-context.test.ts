import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/build-context.compose.yml"
);

describe("build context sync", () => {
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

    it("syncs fixture context to the builder agent and applies the built service", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const response = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                manifestYaml,
                buildContextRoot: "/platform/build-fixtures/minimal-web"
            })
        });

        expect(response.ok).toBe(true);

        const body = await response.json() as {
            manifestName: string;
            diff: { servicesToCreate: number };
        };
        expect(body.manifestName).toBe("build-web");
        expect(body.diff.servicesToCreate).toBeGreaterThanOrEqual(1);

        const servicesResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/services`);
        expect(servicesResponse.ok).toBe(true);

        const services = await servicesResponse.json() as Array<{ name: string; image: string }>;
        const web = services.find((service) => service.name === "web");
        expect(web).toBeTruthy();
        expect(web?.image).toContain("container-registry://build-web-web");
    });
});
