import { randomUUID } from "node:crypto";

import { Logger } from "../../Logger";

const logCoalesce = Logger.create("pipeline-coalesce");

/**
 * Pending coalesced webhook delivery.
 */
interface CoalescePending {
    timer: ReturnType<typeof setTimeout>;
    deliveryIds: Set<string>;
    runId?: string;
    onFire: () => Promise<void>;
}

/**
 * In-flight run tracking for follow-up scheduling.
 */
interface RunningEntry {
    runId: string;
    followUp: boolean;
}

/**
 * Coalesces webhook pushes and deduplicates delivery ids.
 */
export namespace PipelineCoalesceService {
    const pendingByKey = new Map<string, CoalescePending>();
    const runningByKey = new Map<string, RunningEntry>();
    const deliveryToRun = new Map<string, string>();

    /**
     * Parses a duration string like 60s into milliseconds.
     *
     * @param window Duration token
     * @returns Milliseconds
     */
    export function parseWindowMs(window: string): number {
        const match = /^(\d+)(ms|s|m|h)$/.exec(window.trim());

        if (!match) {
            return 60_000;
        }

        const value = Number(match[1]);
        const unit = match[2];

        if (unit === "ms") {
            return value;
        }

        if (unit === "s") {
            return value * 1000;
        }

        if (unit === "m") {
            return value * 60_000;
        }

        return value * 3_600_000;
    }

    /**
     * Returns an existing run for a webhook delivery id.
     *
     * @param deliveryId GitHub delivery id or mock id
     * @returns Run id when already seen
     */
    export function findRunByDeliveryId(deliveryId: string): string | undefined {
        return deliveryToRun.get(deliveryId);
    }

    /**
     * Associates a webhook delivery id with a pipeline run.
     *
     * @param deliveryId Webhook delivery id
     * @param runId Pipeline run id
     * @returns Nothing.
     */
    export function rememberDelivery(deliveryId: string, runId: string): void {
        if (!deliveryId) {
            return;
        }

        deliveryToRun.set(deliveryId, runId);
    }

    /**
     * Schedules or extends a coalesced run for the given key.
     *
     * @param key Coalesce key (manifest + branch + scope)
     * @param windowMs Debounce window
     * @param deliveryId Webhook delivery id
     * @param onFire Callback when the window closes
     * @returns Nothing.
     */
    export async function schedule(
        key: string,
        windowMs: number,
        deliveryId: string,
        onFire: () => Promise<void>
    ): Promise<void> {
        if (deliveryId && deliveryToRun.has(deliveryId)) {
            return;
        }

        const running = runningByKey.get(key);

        if (running) {
            running.followUp = true;
            if (deliveryId) {
                deliveryToRun.set(deliveryId, running.runId);
            }
            return;
        }

        const existing = pendingByKey.get(key);

        if (existing) {
            clearTimeout(existing.timer);
            existing.deliveryIds.add(deliveryId);
            existing.onFire = onFire;
            existing.timer = setTimeout(() => {
                void firePending(key);
            }, windowMs);
            return;
        }

        const pending: CoalescePending = {
            deliveryIds: new Set(deliveryId ? [deliveryId] : []),
            onFire,
            timer: setTimeout(() => {
                void firePending(key);
            }, windowMs)
        };

        pendingByKey.set(key, pending);
    }

    /**
     * Cancels a pending coalesce window (branch delete).
     *
     * @param key Coalesce key
     * @returns Nothing.
     */
    export function cancelPending(key: string): void {
        const pending = pendingByKey.get(key);

        if (!pending) {
            return;
        }

        clearTimeout(pending.timer);
        pendingByKey.delete(key);
    }

    /**
     * Marks a key as running for follow-up semantics.
     *
     * @param key Coalesce key
     * @param runId Pipeline run id
     * @returns Nothing.
     */
    export function markRunning(key: string, runId: string): void {
        runningByKey.set(key, {
            runId,
            followUp: false
        });

        const pending = pendingByKey.get(key);

        if (pending) {
            for (const deliveryId of pending.deliveryIds) {
                deliveryToRun.set(deliveryId, runId);
            }
        }
    }

    /**
     * Clears running state and schedules follow-up when needed.
     *
     * @param key Coalesce key
     * @param windowMs Debounce window for follow-up
     * @param onFire Follow-up callback
     * @returns Nothing.
     */
    export async function markFinished(
        key: string,
        windowMs: number,
        onFire: () => Promise<void>
    ): Promise<void> {
        const running = runningByKey.get(key);

        if (!running) {
            return;
        }

        runningByKey.delete(key);

        if (!running.followUp) {
            return;
        }

        await schedule(key, windowMs, randomUUID(), onFire);
    }

    /**
     * Fires a pending coalesce entry.
     *
     * @param key Coalesce key
     * @returns Nothing.
     */
    async function firePending(key: string): Promise<void> {
        const pending = pendingByKey.get(key);

        if (!pending) {
            return;
        }

        pendingByKey.delete(key);

        try {
            await pending.onFire();
        } catch (err) {
            logCoalesce.error("coalesced pipeline run failed: %O", err);
        }
    }
}
