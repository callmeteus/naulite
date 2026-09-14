import type { Node, PipelineEvent, PipelineRun, PipelineRunKind } from "@naulite/sdk";

import { isAgentRelatedText } from "./instanceDetailPresentation";

const AGENT_DEPENDENT_RUN_KINDS = new Set<PipelineRunKind>([
    "apply",
    "gitops_sync",
    "gitops_apply",
    "infra",
    "ci_build"
]);

const UNREACHABLE_NODE_STATUSES = new Set<Node["status"]>([
    "offline",
    "unhealthy",
    "draining"
]);

/**
 * Returns whether a pipeline run kind depends on a reachable node agent.
 *
 * @param kind Pipeline run kind
 * @returns True when the run may stall without agent connectivity
 */
export function isAgentDependentRunKind(kind: PipelineRunKind): boolean {
    return AGENT_DEPENDENT_RUN_KINDS.has(kind);
}

/**
 * Collects node identifiers referenced by a pipeline run.
 *
 * @param run Pipeline run record
 * @returns Unique node ids from the run and its steps
 */
export function collectRunNodeIds(run: PipelineRun): string[] {
    const ids = new Set<string>();

    if (run.nodeId) {
        ids.add(run.nodeId);
    }

    for (const step of run.steps ?? []) {
        if (step.nodeId) {
            ids.add(step.nodeId);
        }
    }

    return [...ids];
}

/**
 * Returns whether run content mentions an agent connectivity problem.
 *
 * @param run Pipeline run record
 * @param events Pipeline events for the run
 * @returns True when logs or messages look agent-related
 */
export function hasAgentRelatedRunContent(run: PipelineRun, events: PipelineEvent[]): boolean {
    if (isAgentRelatedText(run.errorMessage) || isAgentRelatedText(run.failureLog)) {
        return true;
    }

    for (const step of run.steps ?? []) {
        if (isAgentRelatedText(step.logText)) {
            return true;
        }
    }

    for (const event of events) {
        if (isAgentRelatedText(event.message)) {
            return true;
        }
    }

    return false;
}

/**
 * Returns whether a node cannot receive agent traffic.
 *
 * @param node Cluster node record
 * @returns True when the node is offline or has no agent URL
 */
export function isNodeAgentUnreachable(node: Node): boolean {
    if (UNREACHABLE_NODE_STATUSES.has(node.status)) {
        return true;
    }

    return !node.agentUrl;
}

/**
 * Returns whether any referenced node is unreachable for agent dispatch.
 *
 * @param nodeIds Node ids referenced by the run
 * @param nodes Cluster node inventory
 * @returns True when at least one target node cannot be reached
 */
export function hasUnreachableRunNodes(nodeIds: string[], nodes: Node[]): boolean {
    if (nodeIds.length === 0) {
        return nodes.some((node) => isNodeAgentUnreachable(node));
    }

    const nodesById = new Map(nodes.map((node) => [node.id, node]));

    return nodeIds.some((nodeId) => {
        const node = nodesById.get(nodeId);

        return !node || isNodeAgentUnreachable(node);
    });
}

/**
 * Returns whether a pipeline run is still in progress.
 *
 * @param status Pipeline run status
 * @returns True when the run is pending or running
 */
export function isActivePipelineRun(status: PipelineRun["status"]): boolean {
    return status === "pending" || status === "running" || status === "awaiting_approval";
}

/**
 * Returns whether the run should show the generic in-progress banner.
 *
 * @param status Pipeline run status
 * @returns True for pending or running only
 */
export function isRunInProgressBanner(status: PipelineRun["status"]): boolean {
    return status === "pending" || status === "running";
}

/**
 * Optional signals used when deciding whether to show the agent banner.
 */
export interface RunAgentUnreachableContext {
    agentMetricsReachable?: boolean | null;
}

/**
 * Returns whether the run detail page should show the agent unreachable banner.
 *
 * @param run Pipeline run record
 * @param nodes Cluster node inventory
 * @param events Pipeline events for the run
 * @param context Optional reachability probes
 * @returns True when the operator should check node agents
 */
export function shouldShowRunAgentUnreachableBanner(
    run: PipelineRun,
    nodes: Node[],
    events: PipelineEvent[],
    context: RunAgentUnreachableContext = {}
): boolean {
    if (!isAgentDependentRunKind(run.kind)) {
        return false;
    }

    if (hasAgentRelatedRunContent(run, events)) {
        return true;
    }

    if (nodes.length === 0) {
        return false;
    }

    const onlineNodeCount = nodes.filter((node) => node.status === "online").length;

    if (
        context.agentMetricsReachable === false
        && onlineNodeCount > 0
        && (isActivePipelineRun(run.status) || run.status === "failed")
    ) {
        return true;
    }

    if (
        (isActivePipelineRun(run.status) || run.status === "failed")
        && hasUnreachableRunNodes(collectRunNodeIds(run), nodes)
    ) {
        return true;
    }

    return false;
}
