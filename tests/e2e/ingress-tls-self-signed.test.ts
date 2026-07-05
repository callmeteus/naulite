import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/ingress-tls.compose.yml"
);

describe("self-signed TLS ingress via gateway routes", () => {
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

    it("routes HTTPS traffic through Traefik with self_signed TLS mode", async (context) => {
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
        const applyResponse = await fetch(`${LocalTestCluster.getControlPlaneUrl()}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(applyResponse.ok).toBe(true);

        const traefikConfigResponse = await fetch(
            `${LocalTestCluster.getTraefikDynamicConfigStoreUrl()}/last-config`
        );
        expect(traefikConfigResponse.ok).toBe(true);

        const traefikConfig = await traefikConfigResponse.json() as {
            http?: { routers?: Record<string, { tls?: Record<string, unknown> }> };
        };
        const router = Object.values(traefikConfig.http?.routers ?? {})[0];
        expect(router?.tls).toEqual({});

        await LocalTestCluster.waitForTraefikIngressTls("web-tls.test.local");

        const ingressResponse = await LocalTestCluster.fetchTraefikHttps("/", "web-tls.test.local");
        expect(ingressResponse.ok).toBe(true);

        const body = await ingressResponse.text();
        expect(body.toLowerCase()).toContain("welcome to nginx");
    }, 180_000);
});
