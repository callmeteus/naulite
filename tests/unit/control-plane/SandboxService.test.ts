import { afterEach, describe, expect, it, vi } from "vitest";

import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { AgentProxyService } from "../../../packages/control-plane/src/services/AgentProxyService";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";
import { SandboxService } from "../../../packages/control-plane/src/services/SandboxService";
import { FakeSandboxHost } from "../../harness/FakeSandboxHost";

describe("SandboxService", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        FakeSandboxHost.reset();
    });

    /**
     * Installs store and services for sandbox tests.
     *
     * @returns Nothing.
     */
    function installHappyStore(): void {
        ControlPlaneService.install({
            store: {
                getSandboxTemplate: vi.fn(async () => ({
                    id: "luckymaker-workspace",
                    nodeId: "ci-1",
                    incusName: "luckymaker-workspace",
                    snapshot: "base",
                    modulesVolume: "luckymaker-workspace-modules",
                    warmPoolSize: 0,
                    bakeCron: null,
                    bakedAt: null,
                    sizeBytes: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                })),
                getNode: vi.fn(async (id: string) => ({
                    id,
                    hostname: id,
                    status: "online",
                    labels: { incusPoolDriver: "zfs" },
                    capabilities: ["sandbox"],
                    resources: {
                        cpuMillisTotal: 1000,
                        cpuMillisUsed: 0,
                        memoryMbTotal: 4096,
                        memoryMbUsed: 0,
                        diskMbTotal: 4096,
                        diskMbUsed: 0
                    },
                    agentVersion: "1",
                    agentUrl: "http://127.0.0.1:9470",
                    lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                })),
                getNodeByHostname: vi.fn(async () => null),
                findIdleWarmSandboxInstance: vi.fn(async () => null),
                saveSandboxInstance: vi.fn(async () => undefined),
                listSandboxInstances: vi.fn(async () => [])
            }
        } as ControlPlaneContext);

        vi.spyOn(PipelineRunService, "emitEvent").mockResolvedValue(undefined);
        vi.spyOn(AgentProxyService, "postTask").mockImplementation(async (_url, path) => {
            if (path === "/tasks/sandbox/clone") {
                FakeSandboxHost.recordClone();
            }

            if (path === "/tasks/sandbox/exec") {
                return { failed: false, rc: 0, stdout: "built\n" };
            }

            if (path === "/tasks/sandbox/collect") {
                return { paths: ["luckymaker-frontend/dist/index.html"] };
            }

            return {};
        });
        vi.spyOn(AgentProxyService, "deleteTask").mockImplementation(async () => {
            FakeSandboxHost.recordDestroy();
            return {};
        });
    }

    it("executes clone, exec, collect, and destroy on the happy path", async () => {
        installHappyStore();

        const result = await SandboxService.executeBuild("ci-1", {
            name: "yarn build",
            module: "build",
            targetGroup: "ci-builders",
            sandbox: {
                parent: "luckymaker-workspace",
                workdir: "/workspace"
            },
            command: ["lm", "build", "frontend"],
            outputs: ["luckymaker-frontend/dist/"]
        }, {
            runId: "run-abc"
        });

        expect(result.rc).toBe(0);
        expect(result.sandboxInstance).toContain("build-run-abc");
        expect(result.outputPaths).toEqual(["luckymaker-frontend/dist/index.html"]);
        expect(FakeSandboxHost.getCloneCount()).toBe(1);
        expect(FakeSandboxHost.getDestroyCount()).toBe(1);
    });

    it("throws when the node lacks a CoW sandbox pool", async () => {
        ControlPlaneService.install({
            store: {
                getSandboxTemplate: vi.fn(async () => ({
                    id: "luckymaker-workspace",
                    nodeId: "ci-1",
                    incusName: "luckymaker-workspace",
                    snapshot: "base",
                    modulesVolume: "luckymaker-workspace-modules",
                    warmPoolSize: 0,
                    bakeCron: null,
                    bakedAt: null,
                    sizeBytes: null,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                })),
                getNode: vi.fn(async () => ({
                    id: "ci-1",
                    hostname: "ci-1",
                    status: "online",
                    labels: { incusPoolDriver: "dir" },
                    capabilities: ["sandbox"],
                    resources: {
                        cpuMillisTotal: 1000,
                        cpuMillisUsed: 0,
                        memoryMbTotal: 4096,
                        memoryMbUsed: 0,
                        diskMbTotal: 4096,
                        diskMbUsed: 0
                    },
                    agentVersion: "1",
                    agentUrl: "http://127.0.0.1:9470",
                    lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z"
                })),
                getNodeByHostname: vi.fn(async () => null),
                findIdleWarmSandboxInstance: vi.fn(async () => null),
                saveSandboxInstance: vi.fn(async () => undefined),
                listSandboxInstances: vi.fn(async () => [])
            }
        } as ControlPlaneContext);

        await expect(SandboxService.executeBuild("ci-1", {
            name: "yarn build",
            module: "build",
            sandbox: { parent: "luckymaker-workspace" },
            command: ["yarn", "build"],
            outputs: ["dist/"]
        }, {})).rejects.toThrow("No sandbox-capable node");
    });

    it("runs two parallel clones without sharing state", async () => {
        installHappyStore();

        const task = {
            name: "yarn build",
            module: "build" as const,
            sandbox: {
                parent: "luckymaker-workspace",
                workdir: "/workspace"
            },
            command: ["lm", "build", "frontend"],
            outputs: ["luckymaker-frontend/dist/"]
        };

        const [first, second] = await Promise.all([
            SandboxService.executeBuild("ci-1", task, { runId: "run-a" }),
            SandboxService.executeBuild("ci-1", task, { runId: "run-b" })
        ]);

        expect(first.sandboxInstance).not.toBe(second.sandboxInstance);
        expect(FakeSandboxHost.getCloneCount()).toBe(2);
        expect(FakeSandboxHost.getDestroyCount()).toBe(2);
    });

    it("destroys the clone when exec fails", async () => {
        installHappyStore();

        vi.spyOn(AgentProxyService, "postTask").mockImplementation(async (_url, path) => {
            if (path === "/tasks/sandbox/clone") {
                FakeSandboxHost.recordClone();
                return {};
            }

            if (path === "/tasks/sandbox/exec") {
                return { failed: true, rc: 1, stdout: "", stderr: "build failed" };
            }

            if (path === "/tasks/sandbox/collect") {
                return { paths: [] };
            }

            return {};
        });

        await expect(SandboxService.executeBuild("ci-1", {
            name: "yarn build",
            module: "build",
            sandbox: { parent: "luckymaker-workspace" },
            command: ["yarn", "build"],
            outputs: ["dist/"]
        }, { runId: "run-fail" })).rejects.toThrow("build failed");

        expect(FakeSandboxHost.getDestroyCount()).toBe(1);
    });

    it("does not warm-clone when warmPoolSize is zero", async () => {
        installHappyStore();
        const postTask = vi.spyOn(AgentProxyService, "postTask");

        const template = await ControlPlaneService.Store.getSandboxTemplate("luckymaker-workspace");
        const node = await ControlPlaneService.Store.getNode("ci-1");

        if (!template || !node) {
            throw new Error("test store missing template or node");
        }

        postTask.mockClear();
        await SandboxService.replenishWarmPool(template, node);

        const warmClones = postTask.mock.calls.filter((call) => call[1] === "/tasks/sandbox/clone");
        expect(warmClones).toHaveLength(0);
    });
});

describe("SandboxService.isCowSandboxNode", () => {
    it("accepts zfs and btrfs drivers", () => {
        expect(SandboxService.isCowSandboxNode({
            id: "n1",
            hostname: "n1",
            status: "online",
            labels: { incusPoolDriver: "zfs" },
            capabilities: ["sandbox"],
            resources: {
                cpuMillisTotal: 1,
                cpuMillisUsed: 0,
                memoryMbTotal: 1,
                memoryMbUsed: 0,
                diskMbTotal: 1,
                diskMbUsed: 0
            },
            agentVersion: "1",
            lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
        })).toBe(true);
    });

    it("rejects dir storage even with sandbox capability", () => {
        expect(SandboxService.isCowSandboxNode({
            id: "n1",
            hostname: "n1",
            status: "online",
            labels: { incusPoolDriver: "dir" },
            capabilities: ["sandbox"],
            resources: {
                cpuMillisTotal: 1,
                cpuMillisUsed: 0,
                memoryMbTotal: 1,
                memoryMbUsed: 0,
                diskMbTotal: 1,
                diskMbUsed: 0
            },
            agentVersion: "1",
            lastHeartbeatAt: "2026-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z"
        })).toBe(false);
    });
});
