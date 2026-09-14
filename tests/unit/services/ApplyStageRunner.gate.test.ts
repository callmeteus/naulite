import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplyStageRunner } from "../../../packages/control-plane/src/services/ApplyStageRunner";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";
import { FakeHostExecutor } from "../../harness/FakeHostExecutor";

describe("ApplyStageRunner gates", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("pauses at a confirm task", async () => {
        vi.spyOn(PipelineRunService, "emitEvent").mockResolvedValue({
            id: 1,
            runId: "run-gate-1",
            kind: "deploy.gate.awaiting",
            message: "Continuar?",
            createdAt: new Date().toISOString()
        } as never);
        const updateSpy = vi.spyOn(PipelineRunService, "updateRunFields").mockResolvedValue(null);

        const executor = new FakeHostExecutor();
        const status = await ApplyStageRunner.runTasks({
            runId: "run-gate-1",
            manifest: {
                name: "gated-playbook",
                services: {},
                tasks: [
                    {
                        name: "wait-for-operator",
                        module: "confirm",
                        prompt: "Continuar?"
                    },
                    {
                        name: "after-gate",
                        module: "command",
                        command: ["/bin/echo", "gated-after"]
                    }
                ],
                vars: {},
                volumes: {},
                networks: {},
                registries: {}
            },
            executor
        });

        expect(status).toBe("awaiting_approval");
        expect(executor.getCalls()).toHaveLength(0);
        expect(updateSpy).toHaveBeenCalledWith("run-gate-1", expect.objectContaining({
            status: "awaiting_approval",
            gateStepId: "wait-for-operator"
        }));
    });

    it("skips the approved confirm and runs the following command", async () => {
        vi.spyOn(PipelineRunService, "getRun").mockResolvedValue({
            id: "run-gate-1",
            status: "awaiting_approval",
            gateStepId: "wait-for-operator",
            pendingPlan: {
                tasks: [
                    {
                        name: "before-gate",
                        module: "command",
                        command: ["/bin/echo", "gated-before"]
                    },
                    {
                        name: "wait-for-operator",
                        module: "confirm",
                        prompt: "Continuar?"
                    },
                    {
                        name: "after-gate",
                        module: "command",
                        command: ["/bin/echo", "gated-after"]
                    }
                ],
                cursor: 1,
                registers: {},
                vars: {}
            }
        } as never);
        vi.spyOn(PipelineRunService, "updateRunFields").mockResolvedValue(null);
        vi.spyOn(PipelineRunService, "emitEvent").mockResolvedValue({
            id: 2,
            runId: "run-gate-1",
            kind: "deploy.step.finished",
            message: "after-gate",
            createdAt: new Date().toISOString()
        } as never);
        const completeSpy = vi.spyOn(PipelineRunService, "completeRun").mockResolvedValue(null);

        const executor = new FakeHostExecutor();
        const status = await ApplyStageRunner.continueRun("run-gate-1", "admin", executor);

        expect(status).toBe("succeeded");
        expect(executor.getCalls()).toHaveLength(1);
        expect(executor.getCalls()[0]?.task.name).toBe("after-gate");
        expect(completeSpy).toHaveBeenCalledWith("run-gate-1", "succeeded", {});
    });
});
