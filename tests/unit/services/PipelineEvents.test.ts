import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";

describe("pipeline events flow", () => {
    let databaseProvider: DatabaseProvider;

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
        }
    });

    it("persists agent-style step events through the run API model", async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-pipeline-e2e-"));
        const storagePath = path.join(tempDir, "control-plane.db");
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({ dialect: "sqlite", url: `sqlite://${storagePath}` });
        await databaseProvider.migrate();

        const run = await PipelineRunService.createRun({
            kind: "ci_build",
            serviceName: "api",
            imageRef: "platform/api:latest"
        });

        await PipelineRunService.transitionStep(run.id, "docker-build", "running", {
            message: "build.step.started",
            eventKind: "build.step.started"
        });
        await PipelineRunService.transitionStep(run.id, "docker-build", "succeeded", {
            message: "build.step.finished",
            eventKind: "build.step.finished"
        });
        await PipelineRunService.completeRun(run.id, "succeeded");

        const detail = await PipelineRunService.getRun(run.id);
        const events = await PipelineRunService.listEvents(run.id);

        expect(detail?.status).toBe("succeeded");
        expect(events.some((event) => event.kind === "build.step.started")).toBe(true);
        expect(events.some((event) => event.kind === "build.step.finished")).toBe(true);
        expect(events.some((event) => event.kind === "ci.build.finished")).toBe(true);
    });
});
