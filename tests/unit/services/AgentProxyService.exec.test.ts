import { afterEach, describe, expect, it, vi } from "vitest";

import type { Instance, Node } from "@naulite/shared";

import type { ControlPlaneStore } from "../../../packages/control-plane/src/database/ControlPlaneStore";
import { AgentProxyService } from "../../../packages/control-plane/src/services/AgentProxyService";

const instance: Instance = {
    id: "demo:web-1",
    serviceId: "web",
    serviceName: "web",
    nodeId: "node-1",
    status: "running",
    image: "nginx:alpine",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

const node: Node = {
    id: "node-1",
    hostname: "agent-1",
    status: "online",
    labels: {},
    capabilities: ["docker"],
    resources: {
        cpuMillisTotal: 1000,
        cpuMillisUsed: 0,
        memoryMbTotal: 1024,
        memoryMbUsed: 0,
        diskMbTotal: 1024,
        diskMbUsed: 0
    },
    agentVersion: "test",
    agentUrl: "http://agent-1:9470",
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
};

const store = {
    listInstances: vi.fn(async () => [instance]),
    listNodes: vi.fn(async () => [node])
} as unknown as ControlPlaneStore;

describe("AgentProxyService.execCommand", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns stdout and exit code from the agent on success", async () => {
        const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
            exitCode: 0,
            stdout: "hello\n",
            stderr: ""
        }), { status: 200 }));

        vi.stubGlobal("fetch", fetchImpl);

        const result = await AgentProxyService.execCommand(store, instance.id, ["echo", "hello"]);

        expect(result).toEqual({
            instanceId: instance.id,
            exitCode: 0,
            stdout: "hello\n",
            stderr: ""
        });

        expect(fetchImpl).toHaveBeenCalledWith(
            "http://agent-1:9470/containers/demo%3Aweb-1/exec",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({ command: ["echo", "hello"] })
            })
        );
    });

    it("throws when the agent responds with an error status", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response("failed", { status: 500 })));

        await expect(
            AgentProxyService.execCommand(store, instance.id, ["false"])
        ).rejects.toMatchObject({
            code: "AGENT_REQUEST_FAILED",
            statusCode: 500
        });
    });
});
