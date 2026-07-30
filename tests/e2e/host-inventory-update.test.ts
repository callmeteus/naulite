import { NauliteClient } from "@naulite/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LocalTestCluster } from "../harness/LocalTestCluster";

describe("host inventory and update flow", () => {
    let dockerEnabled = false;
    let client: NauliteClient;
    let controlPlaneUrl = "";
    let nodeId = "";

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
            client = new NauliteClient({ baseUrl: controlPlaneUrl });

            const nodes = await client.listNodes();
            expect(nodes.length).toBeGreaterThan(0);
            nodeId = nodes[0]?.id ?? "";
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

    it("collects host inventory and runs package/system updates", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const nodes = await client.listNodes();
        const node = nodes.find((entry) => entry.id === nodeId) ?? nodes[0];
        expect(node?.osFamily).toBeTruthy();
        expect(node?.arch).toBeTruthy();

        const inventory = await client.refreshNodeHostInventory(node!.id);
        expect(inventory.packageManager).toBe("apt");
        expect(inventory.summary.total).toBeGreaterThan(0);

        const cached = await client.getNodeHostInventory(node!.id);
        expect(cached.nodeId).toBe(node!.id);

        const packageRun = await client.updateNodePackages(node!.id, ["openssl"]);
        expect(packageRun.status).toBe("succeeded");

        const systemRun = await client.updateNodeSystem(node!.id);
        expect(systemRun.kind).toBe("system");
        expect(typeof systemRun.rebootRequired).toBe("boolean");

        const updates = await client.listNodeHostUpdates(node!.id);
        expect(updates.items.length).toBeGreaterThan(0);
    });

    it("returns 404 for unknown node inventory requests", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const response = await fetch(
            `${controlPlaneUrl}/nodes/missing-node/host/inventory/refresh`,
            {
                method: "POST",
                headers: { Accept: "application/json" }
            }
        );

        expect(response.status).toBe(404);
    });

    it("runs host inventory CLI commands against the local test cluster", async (context) => {
        if (!dockerEnabled) {
            if (LocalTestCluster.isDockerRequired()) {
                throw new Error("Docker test cluster is required but did not start.");
            }
            context.skip();
        }

        const { execFile } = await import("node:child_process");
        const { promisify } = await import("node:util");
        const path = await import("node:path");
        const execFileAsync = promisify(execFile);
        const cliEntrypoint = path.resolve(process.cwd(), "packages/cli/bin/naulite.js");
        const leaderUrl = await LocalTestCluster.getLeaderControlPlaneUrl();
        const nodes = await client.listNodes();
        const targetNodeId = nodes[0]?.id;
        expect(targetNodeId).toBeTruthy();

        const inventory = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                leaderUrl,
                "cluster",
                "nodes",
                "inventory",
                "get",
                targetNodeId!,
                "--refresh"
            ],
            { cwd: process.cwd() }
        );
        expect(inventory.stdout).toContain("packageManager");

        const packageUpdate = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                leaderUrl,
                "cluster",
                "nodes",
                "packages",
                "update",
                targetNodeId!
            ],
            { cwd: process.cwd() }
        );
        expect(packageUpdate.stdout).toContain("succeeded");

        const updates = await execFileAsync(
            process.execPath,
            [
                cliEntrypoint,
                "--url",
                leaderUrl,
                "cluster",
                "nodes",
                "updates",
                "get",
                targetNodeId!
            ],
            { cwd: process.cwd() }
        );
        expect(updates.stdout).toContain("items");
    });
});
