import type { ExecutionPlan, Node } from "@naulite/shared";

import { formatAgentHttpFailureMessage } from "@naulite/shared";

const DEFAULT_AGENT_FETCH_TIMEOUT_MS = 15_000;

/**
 * Resolves the timeout used for outbound agent HTTP requests.
 *
 * @returns Timeout in milliseconds
 */
function resolveAgentFetchTimeoutMs(): number {
    const configured = Number(process.env.NAULITE_AGENT_FETCH_TIMEOUT_MS ?? DEFAULT_AGENT_FETCH_TIMEOUT_MS);

    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_AGENT_FETCH_TIMEOUT_MS;
    }

    return configured;
}

/**
 * Performs a bounded fetch against a node agent.
 *
 * @param url Absolute agent URL
 * @param init Fetch init options
 * @param fetchImpl Fetch implementation
 * @returns Agent HTTP response
 */
async function fetchAgentBounded(
    url: string,
    init: RequestInit,
    fetchImpl: typeof fetch
): Promise<Response> {
    const controller = new AbortController();
    const timeoutMs = resolveAgentFetchTimeoutMs();
    const timer = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        return await fetchImpl(url, {
            ...init,
            signal: controller.signal
        });
    } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
            throw new Error(`Agent request timed out after ${timeoutMs}ms.`);
        }

        throw err;
    } finally {
        clearTimeout(timer);
    }
}

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
            const requestBody = JSON.stringify(plan);

            if (plan.operations.length === 0) {
                results.push({
                    nodeId: plan.nodeId,
                    planId: plan.planId,
                    agentUrl,
                    status: "skipped",
                    message: "Plan has no operations."
                });

                continue;
            }

            try {
                const response = await fetchAgentBounded(`${agentUrl}/execution/apply`, {
                    method: "POST",
                    headers: {
                        Accept: "application/json",
                        "Content-Type": "application/json",
                        "Content-Length": String(Buffer.byteLength(requestBody))
                    },

                    body: requestBody
                }, fetchImpl);

                if (!response.ok) {
                    const text = await response.text();
                    results.push({
                        nodeId: plan.nodeId,
                        planId: plan.planId,
                        agentUrl,
                        status: "failed",
                        httpStatus: response.status,
                        message: formatAgentHttpFailureMessage(response.status, text)
                    });

                    continue;
                }

                const responseText = await response.text();

                if (responseText.trim()) {
                    try {
                        const parsed = JSON.parse(responseText) as { accepted?: boolean };

                        if (parsed.accepted === false) {
                            results.push({
                                nodeId: plan.nodeId,
                                planId: plan.planId,
                                agentUrl,
                                status: "failed",
                                httpStatus: response.status,
                                message: formatAgentHttpFailureMessage(response.status, responseText)
                            });

                            continue;
                        }
                    } catch {
                        // Non-JSON success bodies are ignored.
                    }
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
