import { readFile } from "node:fs/promises";
import path from "node:path";

import { PlatformClient } from "@platform/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/backup-volume.compose.yml"
);
const volumeName = "app-data";

describe("backup flow", () => {
    let dockerEnabled = false;
    let client: PlatformClient;
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
            client = new PlatformClient({ baseUrl: controlPlaneUrl });
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

    it("enqueues a backup run and lists it after manual trigger", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");

        const applyResponse = await fetch(`${controlPlaneUrl}/apply`, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ manifestYaml })
        });
        expect(applyResponse.ok).toBe(true);

        const volumes = await client.listVolumes();
        expect(volumes.some((volume) => volume.name === volumeName)).toBe(true);

        const runResponse = await fetch(
            `${controlPlaneUrl}/backups/${encodeURIComponent(volumeName)}/run`,
            {
                method: "POST",
                headers: { Accept: "application/json" }
            }
        );
        expect(runResponse.status).toBe(200);

        const runBody = await runResponse.json() as {
            id: string;
            volumeName: string;
            status: string;
        };
        expect(runBody.volumeName).toBe(volumeName);
        expect(runBody.id).toBeTruthy();
        expect(runBody.status).toBe("pending");

        const backups = await client.listBackups();
        expect(backups.some((backup) => backup.id === runBody.id && backup.volumeName === volumeName)).toBe(true);
    });
});
