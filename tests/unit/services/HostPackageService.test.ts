import type { HostInventory, Node } from "@naulite/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postTask } = vi.hoisted(() => ({
    postTask: vi.fn()
}));

vi.mock("../../../packages/control-plane/src/services/AgentProxyService", () => ({
    AgentProxyService: {
        postTask
    }
}));

import { HostPackageError, HostPackageService } from "../../../packages/control-plane/src/services/HostPackageService";

/**
 * Builds a five-package inventory with two outdated rows.
 *
 * @returns Host inventory fixture
 */
function inventoryFixture(): HostInventory {
    return {
        nodeId: "node-a",
        packageManager: "apt",
        collectedAt: "2026-07-30T00:00:00.000Z",
        summary: {
            total: 5,
            outdated: 2
        },
        packages: [
            { name: "a", installedVersion: "1", status: "upToDate" },
            { name: "b", installedVersion: "1", availableVersion: "2", status: "outdated" },
            { name: "c", installedVersion: "1", status: "upToDate" },
            { name: "d", installedVersion: "1", availableVersion: "2", status: "outdated" },
            { name: "e", installedVersion: "1", status: "upToDate" }
        ]
    };
}

describe("HostPackageService", () => {
    const node: Node = {
        id: "node-a",
        hostname: "agent-a",
        status: "online",
        labels: {},
        capabilities: [],
        resources: {
            cpuMillisTotal: 1000,
            cpuMillisUsed: 100,
            memoryMbTotal: 1024,
            memoryMbUsed: 128,
            diskMbTotal: 10240,
            diskMbUsed: 512
        },
        agentVersion: "0.1.0",
        agentUrl: "http://agent-a:9470",
        osFamily: "linux",
        osVersion: "Ubuntu 22.04",
        arch: "x86_64",
        lastHeartbeatAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    beforeEach(() => {
        postTask.mockReset();
    });

    it("refreshes inventory from the agent task response", async () => {
        postTask.mockResolvedValue({
            packageManager: "apt",
            packages: [{
                name: "openssl",
                installedVersion: "3.0.2",
                availableVersion: "3.0.3",
                status: "outdated"
            }],
            summary: {
                total: 1,
                outdated: 1
            }
        });

        const saveInventory = vi.fn(async () => undefined);

        const inventory = await HostPackageService.refreshInventory(
            node,
            saveInventory
        );

        expect(postTask).toHaveBeenCalledWith(
            "http://agent-a:9470",
            "/tasks/host-inventory",
            {}
        );
        expect(inventory.nodeId).toBe("node-a");
        expect(inventory.summary.outdated).toBe(1);
        expect(saveInventory).toHaveBeenCalledOnce();
    });

    it("throws unsupported_os when the agent reports it", async () => {
        postTask.mockResolvedValue({
            error: "unsupported_os"
        });

        await expect(
            HostPackageService.refreshInventory(node, async () => undefined)
        ).rejects.toMatchObject({
            code: "unsupported_os",
            status: 400
        });
    });

    it("throws when the node is missing", async () => {
        await expect(
            HostPackageService.requireAgentNode(async () => null, "missing")
        ).rejects.toBeInstanceOf(HostPackageError);
    });

    it("returns the requested page and keeps full summary counts", () => {
        const page = HostPackageService.pageInventory(inventoryFixture(), {
            page: 1,
            limit: 2,
            status: "all"
        });

        expect(page.items.map((entry) => entry.name)).toEqual(["a", "b"]);
        expect(page.total).toBe(5);
        expect(page.summary).toEqual({ total: 5, outdated: 2 });
        expect(page.hasMore).toBe(true);
        expect(page.status).toBe("all");
    });

    it("filters outdated packages before slicing the page", () => {
        const page = HostPackageService.pageInventory(inventoryFixture(), {
            page: 2,
            limit: 1,
            status: "outdated"
        });

        expect(page.items.map((entry) => entry.name)).toEqual(["d"]);
        expect(page.total).toBe(2);
        expect(page.summary.outdated).toBe(2);
        expect(page.hasMore).toBe(false);
    });

    it("returns an empty page when the requested page is past the end", () => {
        const page = HostPackageService.pageInventory(inventoryFixture(), {
            page: 9,
            limit: 2,
            status: "upToDate"
        });

        expect(page.items).toEqual([]);
        expect(page.total).toBe(3);
        expect(page.hasMore).toBe(false);
    });

    it("throws when the node has no agent URL", async () => {
        await expect(
            HostPackageService.requireAgentNode(async () => ({
                ...node,
                agentUrl: undefined
            }), "node-a")
        ).rejects.toMatchObject({
            code: "agent_unavailable",
            status: 503
        });
    });
});
