import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DatabaseProvider } from "../../../packages/control-plane/src/database/DatabaseProvider";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";

describe("PipelineRunService", () => {
    let databaseProvider: DatabaseProvider;
    let storagePath = "";

    afterEach(async () => {
        if (databaseProvider) {
            await databaseProvider.disconnect();
        }
    });

    /**
     * Connects an isolated sqlite database for pipeline run tests.
     *
     * @returns Nothing.
     */
    async function connectDatabase(): Promise<void> {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "platform-pipeline-runs-"));
        storagePath = path.join(tempDir, "control-plane.db");
        databaseProvider = new DatabaseProvider();
        await databaseProvider.connect({ dialect: "sqlite", url: `sqlite://${storagePath}` });
        await databaseProvider.migrate();
    }

    it("creates a run and emits timeline events", async () => {
        await connectDatabase();

        const run = await PipelineRunService.createRun({
            kind: "ci_build",
            serviceName: "api",
            imageRef: "platform/api:latest"
        });

        expect(run.id).toBeTruthy();
        expect(run.status).toBe("pending");

        await PipelineRunService.emitEvent(run.id, {
            kind: "image.build.started",
            message: "Image build started api"
        });

        const events = await PipelineRunService.listEvents(run.id);
        expect(events.length).toBeGreaterThanOrEqual(1);
        expect(events.some((event) => event.kind === "image.build.started")).toBe(true);
    });

    it("completes a run with succeeded status", async () => {
        await connectDatabase();

        const run = await PipelineRunService.createRun({
            kind: "apply",
            manifestName: "demo"
        });

        const completed = await PipelineRunService.completeRun(run.id, "succeeded");

        expect(completed?.status).toBe("succeeded");
        expect(completed?.completedAt).toBeTruthy();
    });

    it("transitions a step through running and finished states", async () => {
        await connectDatabase();

        const run = await PipelineRunService.createRun({
            kind: "ci_build",
            serviceName: "api"
        });

        await PipelineRunService.transitionStep(run.id, "docker-build", "running", {
            message: "docker-build started"
        });
        await PipelineRunService.transitionStep(run.id, "docker-build", "succeeded", {
            message: "docker-build finished",
            eventKind: "build.step.finished"
        });

        const detail = await PipelineRunService.getRun(run.id);
        const step = detail?.steps?.find((entry) => entry.name === "docker-build");

        expect(step?.status).toBe("succeeded");
    });
});
