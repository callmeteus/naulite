import { afterEach, describe, expect, it, vi } from "vitest";

import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { AgentProxyService } from "../../../packages/control-plane/src/services/AgentProxyService";
import { AgentHostExecutor } from "../../../packages/control-plane/src/runtime/AgentHostExecutor";

describe("AgentHostExecutor", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    /**
     * Installs a store stub for node lookup.
     *
     * @param store Store stub
     * @returns Nothing.
     */
    function installStore(store: {
        getNode: (id: string) => Promise<unknown>;
        getNodeByHostname: (hostname: string) => Promise<unknown>;
        getTargetGroup: (id: string) => Promise<unknown>;
        listNodes: () => Promise<unknown>;
    }): void {
        ControlPlaneService.install({
            store
        } as ControlPlaneContext);
    }

    it("posts command argv to the node agent", async () => {
        installStore({
            getNode: vi.fn(async () => ({
                id: "dev-local",
                hostname: "dev-local",
                agentUrl: "http://127.0.0.1:9470"
            })),
            getNodeByHostname: vi.fn(async () => null),
            getTargetGroup: vi.fn(async () => null),
            listNodes: vi.fn(async () => [])
        });

        const postTask = vi.spyOn(AgentProxyService, "postTask").mockResolvedValue({
            changed: true,
            failed: false,
            rc: 0,
            stdout: "gated-before\n"
        });

        const executor = new AgentHostExecutor();
        const result = await executor.execute("dev-local", {
            name: "before-gate",
            module: "command",
            command: ["/bin/echo", "gated-before"]
        }, {});

        expect(postTask).toHaveBeenCalledWith(
            "http://127.0.0.1:9470",
            "/tasks/command",
            expect.objectContaining({
                command: ["/bin/echo", "gated-before"]
            })
        );
        expect(result.rc).toBe(0);
        expect(result.stdout).toBe("gated-before\n");
    });

    it("throws when the node is missing", async () => {
        installStore({
            getNode: vi.fn(async () => null),
            getNodeByHostname: vi.fn(async () => null),
            getTargetGroup: vi.fn(async () => null),
            listNodes: vi.fn(async () => [])
        });

        const executor = new AgentHostExecutor();

        await expect(executor.execute("missing-node", {
            name: "before-gate",
            module: "command",
            command: ["/bin/echo", "nope"]
        }, {})).rejects.toThrow("Node missing-node was not found.");
    });

    it("throws when the module is not implemented", async () => {
        const executor = new AgentHostExecutor();

        await expect(executor.execute("dev-local", {
            name: "apt packages",
            module: "apt",
            packages: ["curl"]
        }, {})).rejects.toThrow("Host module apt is not implemented.");
    });
});
