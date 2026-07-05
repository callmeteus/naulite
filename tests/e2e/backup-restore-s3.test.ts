import { readFile } from "node:fs/promises";
import path from "node:path";

import { NauliteClient } from "@naulite/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/backup-s3-volume.compose.yml"
);
const volumeName = "app-data";

describe("backup restore s3", () => {
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

    it("backs up to S3 and restores through the control plane", async (context) => {
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
            destination?: string;
        };
        expect(runBody.volumeName).toBe(volumeName);
        expect(runBody.id).toBeTruthy();
        expect(runBody.status).toBe("succeeded");
        expect(runBody.destination).toMatch(/^s3:\/\//);

        const restoreResponse = await fetch(
            `${controlPlaneUrl}/backups/${encodeURIComponent(runBody.id)}/restore`,
            {
                method: "POST",
                headers: { Accept: "application/json" }
            }
        );
        expect(restoreResponse.status).toBe(200);

        const restoreBody = await restoreResponse.json() as {
            backupId?: string;
            status?: string;
            volumeName?: string;
        };
        expect(restoreBody.backupId ?? runBody.id).toBe(runBody.id);
        expect(restoreBody.status).toBe("completed");
        expect(restoreBody.volumeName).toBe(volumeName);
    });
});
