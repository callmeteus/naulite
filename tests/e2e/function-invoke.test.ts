import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/function-invoke.compose.yml"
);

describe("function invoke", () => {
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

    it("applies function manifest and invokes run to completion", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const manifestYaml = await readFile(fixturePath, "utf8");
        const applyResponse = await LocalTestCluster.applyManifest(manifestYaml);
        expect(applyResponse.ok).toBe(true);

        const instancesResponse = await LocalTestCluster.fetchLeader("/instances");
        expect(instancesResponse.ok).toBe(true);
        const instances = await instancesResponse.json() as Array<{ serviceName: string }>;
        expect(instances.some((entry) => entry.serviceName === "hello")).toBe(false);

        const invokeResponse = await LocalTestCluster.fetchLeader("/functions/hello/invoke", {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ payload: { test: true } })
        });
        expect(invokeResponse.ok).toBe(true);
        const invokeBody = await invokeResponse.json() as { runId: string };
        expect(invokeBody.runId).toBeTruthy();

        const runResponse = await LocalTestCluster.fetchLeader(`/functions/hello/runs/${invokeBody.runId}`);
        expect(runResponse.ok).toBe(true);
        const run = await runResponse.json() as { status: string; logs?: string; exitCode?: number };
        expect(["completed", "failed", "timed_out"]).toContain(run.status);
        expect(run.exitCode).toBe(0);
        expect(run.logs ?? "").toContain("hello-from-function");
    });
});
