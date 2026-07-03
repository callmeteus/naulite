import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import { LocalTestCluster } from "../../harness/LocalTestCluster";

const execFileAsync = promisify(execFile);

describe("LocalTestCluster docker prerequisites", () => {
    it("detects a reachable docker daemon through the harness helper", async () => {
        const available = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(available);
        expect(available).toBe(true);
    });

    it("communicates with the docker daemon via docker info", async () => {
        const available = await LocalTestCluster.isDockerAvailable();
        LocalTestCluster.assertDockerAvailable(available);

        const { stdout } = await execFileAsync("docker", ["info", "--format", "{{.ServerVersion}}"]);
        expect(stdout.trim().length).toBeGreaterThan(0);
    });
});
