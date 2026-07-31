import type { AgentDispatchResult } from "./AgentDispatcher";

/**
 * Collects non-success dispatch results, optionally scoped to specific nodes.
 *
 * @param dispatch Per-node dispatch results
 * @param relevantNodeIds Node ids tied to watched instances
 * @returns Failed or skipped dispatch entries
 */
function collectDispatchFailures(
    dispatch: AgentDispatchResult[],
    relevantNodeIds?: Iterable<string>
): AgentDispatchResult[] {
    const nodeFilter = relevantNodeIds ? new Set(relevantNodeIds) : null;

    return dispatch.filter((entry) => {
        if (entry.status === "dispatched") {
            return false;
        }

        if (nodeFilter && nodeFilter.size > 0 && !nodeFilter.has(entry.nodeId)) {
            return false;
        }

        return true;
    });
}

/**
 * Turns a dispatch result into an operator-facing failure reason.
 *
 * @param entry Failed or skipped dispatch result
 * @returns Plain-language reason without repeating the node id
 */
export function explainDispatchFailure(entry: AgentDispatchResult): string {
    const message = entry.message?.trim() ?? "";
    const agentUrl = entry.agentUrl?.trim() ?? "";

    if (entry.status === "skipped" && /no agenturl/i.test(message)) {
        return "this node has no registered agent URL";
    }

    if (/timed out/i.test(message)) {
        return agentUrl
            ? `the agent at ${agentUrl} did not respond in time`
            : "the agent did not respond in time";
    }

    if (/no operations/i.test(message)) {
        return "the execution plan had no operations for this node";
    }

    if (entry.httpStatus) {
        const detail = message || `HTTP ${entry.httpStatus}`;

        return agentUrl
            ? `the agent at ${agentUrl} rejected the request (${detail})`
            : `the agent rejected the request (${detail})`;
    }

    if (/fetch failed|econnrefused|enotfound|network/i.test(message)) {
        return agentUrl
            ? `the control plane could not connect to the agent at ${agentUrl}`
            : "the control plane could not connect to the agent";
    }

    if (message) {
        return agentUrl ? `${message} (${agentUrl})` : message;
    }

    return entry.status === "skipped" ? "dispatch was skipped" : "dispatch failed";
}

/**
 * Builds a pipeline run error message when every watched instance failed dispatch.
 *
 * @param dispatch Per-node dispatch results
 * @param relevantNodeIds Node ids tied to watched instances
 * @returns Operator-facing rollout failure summary
 */
export function formatRolloutDispatchFailureMessage(
    dispatch: AgentDispatchResult[],
    relevantNodeIds?: Iterable<string>
): string {
    const failures = collectDispatchFailures(dispatch, relevantNodeIds);

    if (failures.length === 0) {
        return "Rollout failed because the control plane could not dispatch work to any node agent.";
    }

    if (failures.length === 1) {
        const entry = failures[0];

        return `Rollout failed on node ${entry.nodeId}: ${explainDispatchFailure(entry)}.`;
    }

    const details = failures
        .map((entry) => `${entry.nodeId}: ${explainDispatchFailure(entry)}`)
        .join("; ");

    return `Rollout failed because no instance could be started. ${details}.`;
}
