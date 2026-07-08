import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/build-cr-deploy.compose.yml"
);

describe("build container registry deploy", () => {
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

    it("builds on the builder, pushes to /cr, and deploys on the worker", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const response = await LocalTestCluster.applyManifest(manifestYaml, {
            buildContextRoot: "/naulite/build-fixtures/minimal-web"
        });

        expect(response.ok).toBe(true);

        const body = await response.json() as {
            manifestName: string;
            diff: { servicesToCreate: number };
        };
        expect(body.manifestName).toBe("build-cr");
        expect(body.diff.servicesToCreate).toBeGreaterThanOrEqual(1);

        const imagesResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/cr/images`, {
            headers: {
                Authorization: "Bearer naulite-test-agent-key"
            }
        });
        expect(imagesResponse.ok).toBe(true);

        const imagesBody = await imagesResponse.json() as {
            images: Array<{ name: string; tag: string }>;
        };
        expect(imagesBody.images.some((image) => image.name === "build-cr-api" && image.tag === "latest")).toBe(true);

        const servicesResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/services`);
        expect(servicesResponse.ok).toBe(true);

        const services = await servicesResponse.json() as Array<{ name: string; image: string }>;
        const api = services.find((service) => service.name === "api");
        expect(api).toBeTruthy();
        expect(api?.image).toBe("container-registry://build-cr-api:latest");

        const instancesResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/instances`);
        expect(instancesResponse.ok).toBe(true);

        const instances = await instancesResponse.json() as Array<{
            serviceName: string;
            nodeId: string;
            status: string;
        }>;
        const apiInstance = instances.find((instance) => instance.serviceName === "api");
        expect(apiInstance).toBeTruthy();
        expect(apiInstance?.nodeId).toBe("agent-worker");
    }, 600_000);
});
