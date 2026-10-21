import type { PipelineRunKind, PipelineRunStatus } from "@naulite/sdk";

/**
 * Pipeline run kinds exposed in the runs list filter (aligned with control plane `PipelineRunKind`).
 */
export const RUNS_LIST_KIND_FILTER_VALUES: PipelineRunKind[] = [
    "ci_build",
    "ci_pipeline",
    "deploy",
    "canary",
    "apply",
    "gitops_sync",
    "gitops_apply",
    "infra",
    "node_event"
];

/**
 * Returns whether a string is a known pipeline run kind.
 *
 * @param value Raw kind from a route query or API field
 * @returns True when the value is a {@link PipelineRunKind}
 */
export function isPipelineRunKind(value: string): value is PipelineRunKind {
    return (RUNS_LIST_KIND_FILTER_VALUES as readonly string[]).includes(value);
}

/**
 * Resolves a localized label for a pipeline run kind.
 *
 * @param t Vue i18n translate function
 * @param te Vue i18n key-exists function
 * @param kind Pipeline run kind
 * @returns Localized label, or the raw kind when no translation exists
 */
export function pipelineRunKindLabel(
    t: (key: string) => string,
    te: (key: string) => boolean,
    kind: string
): string {
    const key = `pages.runs.kinds.${kind}`;

    if (!te(key)) {
        return kind;
    }

    return t(key);
}

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
