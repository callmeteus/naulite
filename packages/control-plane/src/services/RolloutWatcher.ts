import type { Instance } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { PipelineRunService } from "./PipelineRunService";

/**
 * Watches instance health after apply and emits rollout completion events.
 */
export namespace RolloutWatcher {
    const activeWatches = new Map<string, NodeJS.Timeout>();

    /**
     * Starts watching rollout health for an apply run.
     *
     * @param runId Pipeline run identifier
     * @param instanceIds Instance identifiers to observe
     * @param options Watch configuration
     * @returns Nothing.
     */
    export function watch(
        runId: string,
        instanceIds: string[],
        options: {
            timeoutMs?: number;
            intervalMs?: number;
        } = {}
    ): void {
        if (instanceIds.length === 0) {
            void PipelineRunService.emitEvent(runId, {
                kind: "rollout.finished",
                message: "Rollout finished with no instances to watch."
            });
            void PipelineRunService.completeRun(runId, "succeeded");
            return;
        }

        const timeoutMs = options.timeoutMs ?? Number(process.env.NAULITE_ROLLOUT_TIMEOUT_MS ?? 300_000);
        const intervalMs = options.intervalMs ?? Number(process.env.NAULITE_ROLLOUT_POLL_MS ?? 5_000);
        const startedAt = Date.now();

        const existing = activeWatches.get(runId);

        if (existing) {
            clearInterval(existing);
        }

        const handle = setInterval(() => {
            void poll(runId, instanceIds, startedAt, timeoutMs, handle).catch((err) => {
                console.error("[rollout] watch failed runId=%s err=%O", runId, err);
            });
        }, intervalMs);

        activeWatches.set(runId, handle);
    }

    /**
     * Returns whether an instance satisfies rollout success criteria.
     *
     * @param instance Instance being watched
     * @returns True when the instance is ready
     */
    export function isInstanceRolloutReady(instance: Instance): boolean {
        if (instance.status === "running") {
            return true;
        }

        return instance.health?.healthy === true;
    }

    /**
     * Polls instance health until all instances are healthy or timeout occurs.
     *
     * @param runId Pipeline run identifier
     * @param instanceIds Instance identifiers to observe
     * @param startedAt Watch start timestamp
     * @param timeoutMs Timeout in milliseconds
     * @param handle Interval handle to clear
     * @returns Nothing.
     */
    async function poll(
        runId: string,
        instanceIds: string[],
        startedAt: number,
        timeoutMs: number,
        handle: NodeJS.Timeout
    ): Promise<void> {
        const instances = await ControlPlaneService.Store.listInstances();
        const watched = instances.filter((instance) => instanceIds.includes(instance.id));
        const anyFailed = watched.some((instance) => instance.status === "failed");

        if (anyFailed) {
            clearInterval(handle);
            activeWatches.delete(runId);
            await PipelineRunService.completeRun(runId, "failed", {
                errorMessage: "Rollout failed because one or more instances entered failed status."
            });
            return;
        }

        const allReady = watched.length > 0
            && watched.every((instance) => RolloutWatcher.isInstanceRolloutReady(instance));

        if (allReady) {
            clearInterval(handle);
            activeWatches.delete(runId);
            await PipelineRunService.emitEvent(runId, {
                kind: "rollout.finished",
                message: "Rollout finished with healthy instances."
            });
            await PipelineRunService.completeRun(runId, "succeeded");
            return;
        }

        if (Date.now() - startedAt >= timeoutMs) {
            clearInterval(handle);
            activeWatches.delete(runId);
            await PipelineRunService.completeRun(runId, "failed", {
                errorMessage: "Rollout timed out before all instances became healthy."
            });
        }
    }
}
