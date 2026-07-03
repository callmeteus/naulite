import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/ingress-public.compose.yml"
);

describe("public ingress via gateway routes", () => {
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
    }, 300_000);

    afterAll(async () => {
        if (!dockerEnabled) {
            return;
        }

        await LocalTestCluster.stop();
    }, 180_000);

    it("persists gateway routes and pushes Traefik dynamic config", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const applyResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(applyResponse.ok).toBe(true);

        const routesResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/gateway/routes`);
        expect(routesResponse.ok).toBe(true);

        const routes = await routesResponse.json() as Array<{
            serviceName: string;
            host: string;
            targetHost: string;
        }>;
        expect(routes.some((route) => route.serviceName === "web" && route.host === "web.test.local")).toBe(true);
        expect(routes.find((route) => route.serviceName === "web")?.targetHost).toBeTruthy();

        const traefikConfigResponse = await fetch("http://127.0.0.1:19099/last-config");
        expect(traefikConfigResponse.ok).toBe(true);

        const traefikConfig = await traefikConfigResponse.json() as {
            http?: { routers?: Record<string, unknown> };
        };
        expect(Object.keys(traefikConfig.http?.routers ?? {}).length).toBeGreaterThan(0);
    });
});
