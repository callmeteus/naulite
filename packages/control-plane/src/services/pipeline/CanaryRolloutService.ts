import type { PipelineRollout } from "@naulite/shared";

import { PipelineCoalesceService } from "./PipelineCoalesceService";

/**
 * Result of rolling out one partition item.
 */
export interface CanaryItemResult {
    ok: boolean;
    detail?: string;
}

/**
 * Sequential canary rollout with optional soak and parallel remainder.
 */
export namespace CanaryRolloutService {
    /**
     * Executes rollout over items using partition order when configured.
     *
     * @param items Items to deploy (opaque)
     * @param rollout Rollout block from manifest
     * @param partitionValue Reads partition field from each item
     * @param executeItem Deploy + health for one item
     * @returns Per-item results in execution order
     */
    export async function executeRollout<T>(
        items: T[],
        rollout: PipelineRollout | undefined,
        partitionValue: (item: T) => string,
        executeItem: (item: T) => Promise<CanaryItemResult>
    ): Promise<CanaryItemResult[]> {
        if (!rollout?.partitionBy || !rollout.order || rollout.order.length === 0) {
            const parallel = rollout?.parallel ?? true;

            if (parallel) {
                return Promise.all(items.map((item) => executeItem(item)));
            }

            const serialResults: CanaryItemResult[] = [];

            for (const item of items) {
                serialResults.push(await executeItem(item));
            }

            return serialResults;
        }

        const ordered = partitionItems(items, rollout.order, partitionValue);
        const results: CanaryItemResult[] = [];
        const soakMs = rollout.soak ? PipelineCoalesceService.parseWindowMs(rollout.soak) : 0;
        const firstPartition = rollout.order[0];
        const canaryItems = ordered.get(firstPartition) ?? [];
        const remainder: T[] = [];

        for (const [partition, partitionItemsList] of ordered.entries()) {
            if (partition === firstPartition) {
                continue;
            }

            remainder.push(...partitionItemsList);
        }

        for (const item of canaryItems) {
            const result = await executeItem(item);
            results.push(result);

            if (!result.ok) {
                return results;
            }

            if (soakMs > 0) {
                await sleep(soakMs);
            }
        }

        const remainderResults = await Promise.all(remainder.map((item) => executeItem(item)));
        results.push(...remainderResults);

        return results;
    }

    /**
     * Groups items by partition value preserving manifest order keys.
     *
     * @param items All items
     * @param order Declared partition order
     * @param partitionValue Partition reader
     * @returns Map partition -> items
     */
    function partitionItems<T>(
        items: T[],
        order: string[],
        partitionValue: (item: T) => string
    ): Map<string, T[]> {
        const map = new Map<string, T[]>();

        for (const key of order) {
            map.set(key, []);
        }

        for (const item of items) {
            const key = partitionValue(item);
            const bucket = map.get(key) ?? [];
            bucket.push(item);
            map.set(key, bucket);
        }

        return map;
    }

    /**
     * Sleeps for the given duration.
     *
     * @param ms Milliseconds
     * @returns Nothing.
     */
    function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}
