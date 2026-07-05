import { readFile } from "node:fs/promises";
import path from "node:path";

import { NauliteClient } from "@naulite/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);

describe("gitops rollback", () => {
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
            controlPlaneUrl = LocalTestCluster.getControlPlaneUrl();
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

    it("records revisions and rolls back to a previous manifest", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const updatedManifestYaml = manifestYaml.replace(
            "nginx:1.27-alpine",
            "nginx:1.28-alpine"
        );

        const firstApply = await fetch(`${controlPlaneUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(firstApply.ok).toBe(true);

        const secondApply = await fetch(`${controlPlaneUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml: updatedManifestYaml })
        });
        expect(secondApply.ok).toBe(true);

        const revisionsResponse = await fetch(`${controlPlaneUrl}/gitops/revisions?manifestName=minimal`, {
            headers: { Accept: "application/json" }
        });
        expect(revisionsResponse.ok).toBe(true);

        const revisionsBody = await revisionsResponse.json() as {
            revisions?: Array<{ id: string; manifestName: string }>;
        };
        const revisions = revisionsBody.revisions ?? [];
        expect(revisions.length).toBeGreaterThanOrEqual(2);

        const rollbackTarget = revisions[0]?.id;
        expect(rollbackTarget).toBeTruthy();

        const rollbackResponse = await fetch(
            `${controlPlaneUrl}/gitops/rollback/${encodeURIComponent(rollbackTarget ?? "")}`,
            {
                method: "POST",
                headers: { Accept: "application/json" }
            }
        );
        expect(rollbackResponse.ok).toBe(true);

        const rollbackBody = await rollbackResponse.json() as { manifestName: string };
        expect(rollbackBody.manifestName).toBe("minimal");

        const services = await client.listServices();
        expect(services.some((service) => service.name === "web")).toBe(true);
    });

    it("returns an error when rolling back to an unknown revision id", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const rollbackResponse = await fetch(
            `${controlPlaneUrl}/gitops/rollback/${encodeURIComponent("missing-revision-id")}`,
            {
                method: "POST",
                headers: { Accept: "application/json" }
            }
        );

        const rollbackBody = await rollbackResponse.json() as { message?: string };
        expect(rollbackResponse.ok).toBe(false);
        expect(rollbackResponse.status).toBeGreaterThanOrEqual(400);
        expect(rollbackBody.message).toMatch(/not found/i);
    });
});
