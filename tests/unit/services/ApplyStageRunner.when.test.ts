import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ApplyStageRunner } from "../../../packages/control-plane/src/services/ApplyStageRunner";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";
import { FakeHostExecutor } from "../../harness/FakeHostExecutor";

describe("ApplyStageRunner.when", () => {
    beforeEach(() => {
        vi.spyOn(PipelineRunService, "completeRun").mockResolvedValue(null);
        vi.spyOn(PipelineRunService, "emitEvent").mockResolvedValue({
            id: 1,
            runId: "run-1",
            kind: "deploy.step.finished",
            message: "ok",
            createdAt: new Date().toISOString()
        } as never);
        vi.spyOn(PipelineRunService, "updateRunFields").mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("skips tasks when when expression is false", async () => {
        const executor = new FakeHostExecutor();
        const status = await ApplyStageRunner.runTasks({
            runId: "run-1",
            manifest: {
                name: "app",
                services: {},
                tasks: [
                    {
                        name: "skip me",
                        module: "command",
                        command: ["echo", "no"],
                        when: "TENANT_SLUG"
                    },
                    {
                        name: "run me",
                        module: "command",
                        command: ["echo", "yes"]
                    }
                ],
                vars: { TENANT_SLUG: "" },
                volumes: {},
                networks: {},
                registries: {}
            },
            executor
        });

        expect(status).toBe("succeeded");
        expect(executor.getCalls()).toHaveLength(1);
        expect(executor.getCalls()[0]?.task.name).toBe("run me");
    });
});
