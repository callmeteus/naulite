import type { Manifest } from "@naulite/shared";

import { Logger } from "../Logger";
import { HostExecutorProvider } from "../runtime/HostExecutorProvider";

import { ApplyStageRunner } from "./ApplyStageRunner";

const logPlaybook = Logger.create("apply-playbook");

/**
 * Runs manifest playbook tasks after infra dispatch.
 */
export namespace ApplyPlaybookRunner {
    /**
     * Runs playbook tasks when the manifest declares any.
     *
     * @param runId Pipeline run id
     * @param manifest Applied manifest
     * @param createdBy Optional actor recorded on gates
     * @returns Playbook outcome, or `skipped` when there are no tasks
     */
    export async function runIfPresent(
        runId: string,
        manifest: Manifest,
        createdBy?: string
    ): Promise<"running" | "awaiting_approval" | "succeeded" | "failed" | "skipped"> {
        const tasks = manifest.tasks ?? [];

        if (tasks.length === 0) {
            return "skipped";
        }

        logPlaybook.debug("playbook start runId=%s tasks=%d", runId, tasks.length);

        const status = await ApplyStageRunner.runTasks({
            runId,
            manifest,
            executor: HostExecutorProvider.get(),
            createdBy
        });

        logPlaybook.debug("playbook finished runId=%s status=%s", runId, status);
        return status;
    }
}
