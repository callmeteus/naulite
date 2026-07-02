import type { ExecutionPlan, Node } from "@platform/shared";

/**
 * Result of dispatching an execution plan to a node agent.
 */
export interface AgentDispatchResult {
    nodeId: string;
    planId: string;
    agentUrl: string;
    status: "dispatched" | "skipped" | "failed";
    httpStatus?: number;
    message?: string;
}

/**
 * Dispatches execution plans to node agents over HTTP.
 */
export namespace AgentDispatcher {
    /**
     * Posts execution plans to agents that expose an agentUrl.
     *
     * @param plans Execution plans keyed by node
     * @param nodes Registered cluster nodes
     * @param fetchImpl Fetch implementation for tests
     * @returns Per-node dispatch results
     */
    export async function dispatchPlans(
        plans: ExecutionPlan[],
        nodes: Node[],
        fetchImpl: typeof fetch = fetch
    ): Promise<AgentDispatchResult[]> {
        const nodesById = new Map(nodes.map((node) => [node.id, node]));
        const results: AgentDispatchResult[] = [];

        for (const plan of plans) {
            const node = nodesById.get(plan.nodeId);

            if (!node?.agentUrl) {
                results.push({
                    nodeId: plan.nodeId,
                    planId: plan.planId,
                    agentUrl: node?.agentUrl ?? "",
                    status: "skipped",
                    message: "Node has no agentUrl."
                });
                continue;
            }

            const agentUrl = node.agentUrl.replace(/\/$/, "");

            try {
                const response = await fetchImpl(`${agentUrl}/execution/apply`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(plan)
                });

                if (!response.ok) {
                    const text = await response.text();
                    results.push({
                        nodeId: plan.nodeId,
                        planId: plan.planId,
                        agentUrl,
                        status: "failed",
                        httpStatus: response.status,
                        message: text || `Agent returned HTTP ${response.status}.`
                    });
                    continue;
                }

                results.push({
                    nodeId: plan.nodeId,
                    planId: plan.planId,
                    agentUrl,
                    status: "dispatched",
                    httpStatus: response.status
                });
            } catch (err) {
                results.push({
                    nodeId: plan.nodeId,
                    planId: plan.planId,
                    agentUrl,
                    status: "failed",
                    message: err instanceof Error ? err.message : String(err)
                });
            }
        }

        return results;
    }
}
