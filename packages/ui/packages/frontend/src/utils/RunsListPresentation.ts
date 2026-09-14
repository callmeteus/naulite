import type { PipelineRunStatus } from "@naulite/sdk";

/**
 * Status values exposed in the pipeline runs list filter.
 */
export const RUNS_LIST_STATUS_FILTER_VALUES: PipelineRunStatus[] = [
    "pending",
    "running",
    "awaiting_approval",
    "succeeded",
    "failed"
];

/**
 * Formats the launched-by column for a pipeline run row.
 *
 * @param createdBy Operator identifier from the API
 * @returns Display label or a dash when empty
 */
export function formatRunsListLaunchedBy(createdBy?: string | null): string {
    const trimmed = createdBy?.trim();

    if (!trimmed) {
        return "-";
    }

    return trimmed;
}
