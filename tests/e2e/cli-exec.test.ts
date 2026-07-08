import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

const execFileAsync = promisify(execFile);
const cliEntrypoint = path.resolve(process.cwd(), "packages/cli/bin/naulite.js");
const manifestPath = path.resolve(
    process.cwd(),
    "tests/fixtures/manifests/minimal.compose.yml"
);

describe("naulite exec CLI", () => {
    let dockerEnabled = false;
    let instanceId: string | null = null;
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
            controlPlaneUrl = await LocalTestCluster.getLeaderControlPlaneUrl();

            const manifestYaml = await readFile(manifestPath, "utf8");
            const applyResponse = await LocalTestCluster.applyManifest(manifestYaml);
            expect(applyResponse.ok).toBe(true);

            instanceId = await waitForRunningWebInstance(controlPlaneUrl);
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

    it("runs a non-interactive command through naulite exec", async (context) => {
        if (!dockerEnabled || !instanceId) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const { stdout } = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                controlPlaneUrl,
                "exec",
                instanceId!,
                "--",
                "echo",
                "platform-exec-ok"
            ],
            { cwd: process.cwd() }
        );

        expect(stdout).toContain("platform-exec-ok");
    });

    it("resolves a service name when exactly one running instance exists", async (context) => {
        if (!dockerEnabled || !instanceId) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const { stdout } = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                controlPlaneUrl,
                "exec",
                "web",
                "--",
                "echo",
                "service-target-ok"
            ],
            { cwd: process.cwd() }
        );

        expect(stdout).toContain("service-target-ok");
    });

    it("runs an interactive one-shot command through the WebSocket exec path", async (context) => {
        if (!dockerEnabled || !instanceId) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const { stdout } = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                controlPlaneUrl,
                "exec",
                "-t",
                instanceId!,
                "--",
                "/bin/sh",
                "-c",
                "echo ws-exec-ok"
            ],
            { cwd: process.cwd() }
        );

        expect(stdout).toContain("ws-exec-ok");
    });
});

/**
 * Waits until the minimal fixture web service has a running instance.
 *
 * @param controlPlaneUrl Control plane base URL
 * @returns Running instance id
 */
async function waitForRunningWebInstance(controlPlaneUrl: string): Promise<string> {
    const deadline = Date.now() + 120_000;

    while (Date.now() < deadline) {
        const response = await fetch(`${controlPlaneUrl}/instances`);
        expect(response.ok).toBe(true);

        const instances = await response.json() as Array<{
            id: string;
            serviceName: string;
            status: string;
        }>;

        const running = instances.find((instance) => {
            return instance.serviceName === "web" && instance.status === "running";
        });

        if (running) {
            return running.id;
        }

        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }

    throw new Error("Timed out waiting for running web instance.");
}
