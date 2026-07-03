import { readFile } from "node:fs/promises";
import path from "node:path";

import { PlatformClient } from "@platform/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);

describe("apply minimal manifest via SDK", () => {
    let dockerEnabled = false;
    let client: PlatformClient;

    beforeAll(async () => {
        dockerEnabled = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(dockerEnabled);
        if (!dockerEnabled) {
            return;
        }

        try {
            await LocalTestCluster.start();
            await LocalTestCluster.waitHealthy();
            client = new PlatformClient({
                baseUrl: LocalTestCluster.getControlPlaneUrl()
            });
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

    it("applies the minimal compose fixture and exposes the web service", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const health = await client.getHealth();
        expect(health.status).toBe("healthy");

        const response = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(response.ok).toBe(true);

        const body = await response.json() as {
            manifestName: string;
            diff: { servicesToCreate: number };
            dispatch?: Array<{ status: string }>;
        };
        expect(body.manifestName).toBe("minimal");
        expect(body.diff.servicesToCreate).toBeGreaterThanOrEqual(1);

        if (body.dispatch && body.dispatch.length > 0) {
            expect(body.dispatch[0]?.status).toBe("dispatched");
        }

        const services = await client.listServices();
        expect(services.some((service) => service.name === "web")).toBe(true);
    });

    it("rejects apply requests with an empty manifest body", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const response = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml: "" })
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBeGreaterThanOrEqual(400);
    });
});
