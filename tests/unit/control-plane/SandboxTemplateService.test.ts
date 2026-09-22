import { afterEach, describe, expect, it, vi } from "vitest";

import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { AgentProxyService } from "../../../packages/control-plane/src/services/AgentProxyService";
import { SandboxTemplateService } from "../../../packages/control-plane/src/services/SandboxTemplateService";

describe("SandboxTemplateService.triggerBake", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("calls agent sandbox bake before updating template metadata", async () => {
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
                saveSandboxTemplate: vi.fn(async () => undefined),
                listSandboxInstances: vi.fn(async () => [])
            }
        } as ControlPlaneContext);

        const postTask = vi.spyOn(AgentProxyService, "postTask").mockResolvedValue({ status: "baked" });

        await SandboxTemplateService.triggerBake("luckymaker-workspace");

        expect(postTask).toHaveBeenCalledWith(
            "http://127.0.0.1:9470",
            "/tasks/sandbox/bake",
            expect.objectContaining({
                parent: "luckymaker-workspace"
            })
        );
    });
});
