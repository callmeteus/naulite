import { afterEach, describe, expect, it, vi } from "vitest";

import { CronEvaluator } from "../../../packages/control-plane/src/modules/log-rotation/CronEvaluator";
import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import { SandboxBakeScheduler } from "../../../packages/control-plane/src/services/SandboxBakeScheduler";
import { SandboxTemplateService } from "../../../packages/control-plane/src/services/SandboxTemplateService";

describe("SandboxBakeScheduler", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("triggers bake when cron is due on the leader tick", async () => {
        const now = new Date();
        ControlPlaneService.install({
            store: {
                listSandboxTemplates: vi.fn(async () => ({
                    items: [
                        {
                            id: "luckymaker-workspace",
                            nodeId: "sandbox-1",
                            incusName: "luckymaker-workspace",
                            snapshot: "base",
                            modulesVolume: "luckymaker-workspace-modules",
                            warmPoolSize: 0,
                            bakeCron: "0 3 * * *",
                            bakedAt: null,
                            sizeBytes: null,
                            createdAt: now.toISOString(),
                            updatedAt: now.toISOString()
                        }
                    ],
                    page: 1,
                    limit: 200,
                    total: 1
                }))
            }
        } as never);

        const scheduler = new SandboxBakeScheduler(60_000, { isLeader: () => true });
        vi.spyOn(CronEvaluator, "isDue").mockReturnValue(true);
        const trigger = vi.spyOn(SandboxTemplateService, "triggerBake").mockResolvedValue({
            status: "accepted",
            templateId: "luckymaker-workspace"
        });

        await scheduler.tick();

        expect(trigger).toHaveBeenCalledWith("luckymaker-workspace");
    });

    it("skips tick when replica is not leader", async () => {
        const scheduler = new SandboxBakeScheduler(60_000, { isLeader: () => false });
        const trigger = vi.spyOn(SandboxTemplateService, "triggerBake");

        await scheduler.tick();

        expect(trigger).not.toHaveBeenCalled();
    });
});
