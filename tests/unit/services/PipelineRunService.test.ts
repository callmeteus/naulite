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
        const tempDir = await mkdtemp(path.join(os.tmpdir(), "naulite-pipeline-runs-"));
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
            imageRef: "naulite/api:latest"
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

    it("persists step log text on transitions", async () => {
        await connectDatabase();

        const run = await PipelineRunService.createRun({
            kind: "ci_build",
            serviceName: "api"
        });

        await PipelineRunService.transitionStep(run.id, "docker-build", "running", {
            message: "build.step.started",
            eventKind: "build.step.started"
        });
        await PipelineRunService.transitionStep(run.id, "docker-build", "succeeded", {
            message: "build.step.finished",
            eventKind: "build.step.finished",
            logText: "Step 1/1 : RUN echo hello\n"
        });

        const detail = await PipelineRunService.getRun(run.id);
        const step = detail?.steps?.find((entry) => entry.name === "docker-build");

        expect(step?.logText).toBe("Step 1/1 : RUN echo hello\n");
    });

    it("links a gitops apply run to a revision id", async () => {
        await connectDatabase();

        const run = await PipelineRunService.createRun({
            kind: "gitops_apply",
            manifestName: "demo",
            commitSha: "abc123"
        });

        const linked = await PipelineRunService.linkRevision(run.id, "revision-1");

        expect(linked?.revisionId).toBe("revision-1");
    });
});
