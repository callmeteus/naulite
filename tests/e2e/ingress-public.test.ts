import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/ingress-public.compose.yml"
);

/**
 * Waits until the public ingress route serves HTTP through Traefik.
 *
 * @param host Ingress host header value
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns Nothing.
 */
async function waitForTraefikIngress(host: string, timeoutMs = 120_000): Promise<void> {
    const traefikUrl = LocalTestCluster.getTraefikHttpUrl();
    const controlPlaneUrl = LocalTestCluster.getControlPlaneUrl();
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        try {
            const instancesResponse = await fetch(`${controlPlaneUrl}/instances`);
            if (instancesResponse.ok) {
                const instances = await instancesResponse.json() as Array<{
                    serviceName: string;
                    status: string;
                }>;
                const running = instances.some((instance) => {
                    return instance.serviceName === "web" && instance.status === "running";
                });

                if (running) {
                    const ingressResponse = await fetch(`${traefikUrl}/`, {
                        headers: {
                            Host: host
                        }
                    });

                    if (ingressResponse.ok) {
                        return;
                    }
                }
            }
        } catch {
            // Retry until timeout.
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 2_000);
        });
    }

    throw new Error(`Ingress for host ${host} did not become reachable through Traefik at ${traefikUrl}`);
}

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
    }, 600_000);

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
        const applyResponse = await LocalTestCluster.applyManifest(manifestYaml);
        expect(applyResponse.ok).toBe(true);

        const routesResponse = await fetch(`${leaderUrl}/gateway/routes`);
        expect(routesResponse.ok).toBe(true);

        const routes = await routesResponse.json() as Array<{
            serviceName: string;
            host: string;
            targetHost: string;
        }>;
        expect(routes.some((route) => route.serviceName === "web" && route.host === "web.test.local")).toBe(true);
        expect(routes.find((route) => route.serviceName === "web")?.targetHost).toBeTruthy();

        const traefikConfigResponse = await fetch(
            `${LocalTestCluster.getTraefikDynamicConfigStoreUrl()}/last-config`
        );
        expect(traefikConfigResponse.ok).toBe(true);

        const traefikConfig = await traefikConfigResponse.json() as {
            http?: { routers?: Record<string, unknown> };
        };
        expect(Object.keys(traefikConfig.http?.routers ?? {}).length).toBeGreaterThan(0);
    });

    it("routes HTTP traffic through Traefik to the deployed service", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        if (LocalTestCluster.usesTraefikMock()) {
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const applyResponse = await LocalTestCluster.applyManifest(manifestYaml);
        expect(applyResponse.ok).toBe(true);

        await waitForTraefikIngress("web.test.local");

        const ingressResponse = await fetch(`${LocalTestCluster.getTraefikHttpUrl()}/`, {
            headers: {
                Host: "web.test.local"
            }
        });
        expect(ingressResponse.ok).toBe(true);

        const body = await ingressResponse.text();
        expect(body.toLowerCase()).toContain("welcome to nginx");
    }, 180_000);
});
