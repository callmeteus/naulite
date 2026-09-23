import type { Node } from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { NodeHealthWatcher } from "./NodeHealthWatcher";
import { NodeAgentUrlResolver } from "./NodeAgentUrlResolver";

/**
 * Default timeout for agent health probes when env is unset.
 */
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

/**
 * Marks nodes offline when the control plane cannot reach their agent.
 */
export namespace NodeAgentConnectivityService {
    /**
     * Returns whether an agent proxy error means the agent is not reachable at its URL.
     *
     * @param err Caught agent proxy error
     * @returns True for timeouts and transport failures, not agent HTTP 4xx/5xx
     */
    export function isAgentUnreachableError(err: unknown): boolean {
        const mapped = readAgentProxyError(err);

        if (!mapped) {
            return false;
        }

        if (mapped.code === "AGENT_REQUEST_TIMEOUT") {
            return true;
        }

        if (mapped.code === "AGENT_REQUEST_FAILED") {
            return mapped.statusCode === 502
                || mapped.statusCode === 503
                || mapped.statusCode === 504;
        }

        return false;
    }

    /**
     * Probes the node agent health endpoint from the control plane.
     *
     * @param agentUrl Registered agent base URL
     * @returns True when the agent responds successfully
     */
    export async function probeAgentHealth(agentUrl: string): Promise<boolean> {
        const base = NodeAgentUrlResolver.resolveControlPlaneFetchUrl(agentUrl);
        const timeoutMs = resolveProbeTimeoutMs();
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
        }, timeoutMs);

        try {
            const response = await fetch(`${base}/health`, {
                method: "GET",
                headers: {
                    Accept: "application/json"
                },

                signal: controller.signal
            });

            return response.ok;
        } catch {
            return false;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * Returns the status reported by the agent heartbeat.
     *
     * Reachability of the agent URL is not applied here. A failed inventory
     * request must not flip a node that is still heartbeating.
     *
     * @param _node Current node record
     * @param requestedStatus Status reported by the agent heartbeat body
     * @returns Status stored on the node row
     */
    export async function resolveHeartbeatStatus(
        _node: Node,
        requestedStatus: Node["status"]
    ): Promise<Node["status"]> {
        return requestedStatus;
    }

    /**
     * Marks a node offline after a failed agent reachability check.
     *
     * @param nodeId Node identifier
     * @returns Updated node when the status changed
     */
    export async function markOfflineWhenAgentUnreachable(nodeId: string): Promise<Node | null> {
        const node = await ControlPlaneService.Store.getNode(nodeId);

        if (!node) {
            return null;
        }

        if (node.status === "offline" || node.status === "registering") {
            return node;
        }

        const updated = await ControlPlaneService.Store.updateNodeStatus(nodeId, "offline");

        if (updated) {
            await NodeHealthWatcher.onHeartbeat(updated);
        }

        return updated;
    }

    /**
     * Marks a node offline when an agent proxy call failed with a transport error.
     *
     * @param nodeId Node identifier
     * @param err Caught error from agent forwarding
     * @returns Nothing.
     */
    export async function markOfflineFromAgentError(nodeId: string, err: unknown): Promise<void> {
        if (!isAgentUnreachableError(err)) {
            return;
        }

        await markOfflineWhenAgentUnreachable(nodeId);
    }
}

/**
 * Reads stable agent proxy error fields without importing AgentProxyService.
 *
 * @param err Caught error value
 * @returns Error code and HTTP status when present
 */
function readAgentProxyError(err: unknown): { code: string; statusCode: number } | null {
    if (typeof err !== "object" || err === null) {
        return null;
    }

    if (!("code" in err) || !("statusCode" in err)) {
        return null;
    }

    const code = err.code;
    const statusCode = err.statusCode;

    if (typeof code !== "string" || typeof statusCode !== "number") {
        return null;
    }

    return {
        code,
        statusCode
    };
}

/**
 * Resolves the timeout used for agent health probes.
 *
 * @returns Timeout in milliseconds
 */
function resolveProbeTimeoutMs(): number {
    const configured = Number(process.env.NAULITE_AGENT_PROBE_TIMEOUT_MS ?? DEFAULT_PROBE_TIMEOUT_MS);

    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_PROBE_TIMEOUT_MS;
    }

    return configured;
}
