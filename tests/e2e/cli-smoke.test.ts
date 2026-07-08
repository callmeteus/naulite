import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const execFileAsync = promisify(execFile);
const cliEntrypoint = path.resolve(process.cwd(), "packages/cli/bin/naulite.js");

describe("naulite CLI smoke", () => {
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

    it("prints cluster status through the CLI against the local test cluster", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const leaderUrl = await LocalTestCluster.getLeaderControlPlaneUrl();
        const { stdout } = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                leaderUrl,
                "cluster",
                "status",
                "get"
            ],
            { cwd: process.cwd() }
        );

        expect(stdout).toContain("healthy");
        expect(stdout).toContain("applyRevision");
    });

    it("fails when the CLI targets an unreachable control plane URL", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        await expect(execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                "http://127.0.0.1:1",
                "cluster",
                "status",
                "get"
            ],
            { cwd: process.cwd() }
        )).rejects.toThrow();
    });
});
