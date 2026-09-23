import type { Node } from "@naulite/shared";

import { Logger } from "../Logger";
import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import type { LeaderElection } from "./LeaderElection";
import { NodeAgentConnectivityService } from "./NodeAgentConnectivityService";

const logAgentWatchdog = Logger.create("agent-watchdog");

/**
 * Default connectivity sweep interval in milliseconds.
 */
const DEFAULT_SWEEP_INTERVAL_MS = 30_000;

/**
 * Default heartbeat staleness threshold in milliseconds.
 */
const DEFAULT_HEARTBEAT_STALE_MS = 90_000;

/**
 * Periodically probes node agents and marks stale or unreachable nodes offline.
 */
export class NodeAgentConnectivityWatchdog {
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Creates the connectivity watchdog.
     *
     * @param store Control plane persistence layer
     */
    constructor(private readonly store: ControlPlaneStore) {}

    /**
     * Starts leader-only connectivity sweeps.
     *
     * @param leaderElection Leader election service
     * @param intervalMs Sweep interval in milliseconds
     * @returns Nothing.
     */
    startPolling(leaderElection: LeaderElection, intervalMs = DEFAULT_SWEEP_INTERVAL_MS): void {
        if (this.pollTimer) {
            return;
        }

        this.pollTimer = setInterval(() => {
            void this.tick(leaderElection).catch((err) => {
                logAgentWatchdog.error("sweep failed: %O", err);
            });
        }, intervalMs);

        void this.tick(leaderElection).catch((err) => {
            logAgentWatchdog.error("sweep failed: %O", err);
        });

        console.debug("[agent-watchdog] polling started intervalMs=%d", intervalMs);
    }

    /**
     * Runs one sweep when this process is the leader.
     *
     * @param leaderElection Leader election service
     * @returns Nothing.
     */
    private async tick(leaderElection: LeaderElection): Promise<void> {
        if (!leaderElection.isLeader()) {
            return;
        }

        await this.sweepAll();
    }

    /**
     * Stops connectivity sweeps.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (!this.pollTimer) {
            return;
        }

        clearInterval(this.pollTimer);
        this.pollTimer = null;
        console.debug("[agent-watchdog] polling stopped");
    }

    /**
     * Probes every registered node and applies offline transitions.
     *
     * @returns Nothing.
     */
    async sweepAll(): Promise<void> {
        const nodes = await this.store.listNodes();
        const now = Date.now();
        const staleMs = resolveHeartbeatStaleMs();

        for (const node of nodes) {
            await this.sweepNode(node, now, staleMs);
        }
    }

    /**
     * Evaluates one node and marks it offline when heartbeats stopped.
     *
     * @param node Node record
     * @param nowMs Current time in milliseconds
     * @param staleMs Heartbeat staleness threshold
     * @returns Nothing.
     */
    async sweepNode(node: Node, nowMs: number, staleMs: number): Promise<void> {
        if (!node.agentUrl || node.status === "registering") {
            return;
        }

        const lastHeartbeatMs = new Date(node.lastHeartbeatAt).getTime();
        const heartbeatStale = Number.isFinite(lastHeartbeatMs)
            && nowMs - lastHeartbeatMs > staleMs;

        if (!heartbeatStale || node.status === "offline") {
            return;
        }

        logAgentWatchdog.debug(
            "mark offline nodeId=%s reason=stale_heartbeat ageMs=%d",
            node.id,
            nowMs - lastHeartbeatMs
        );

        await NodeAgentConnectivityService.markOfflineWhenAgentUnreachable(node.id);
    }
}

/**
 * Resolves the heartbeat staleness threshold.
 *
 * @returns Staleness window in milliseconds
 */
function resolveHeartbeatStaleMs(): number {
    const configured = Number(process.env.NAULITE_NODE_HEARTBEAT_STALE_MS ?? DEFAULT_HEARTBEAT_STALE_MS);

    if (!Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_HEARTBEAT_STALE_MS;
    }

    return configured;
}

/**
 * Creates a node agent connectivity watchdog.
 *
 * @param store Control plane persistence layer
 * @returns Connectivity watchdog instance
 */
export function createNodeAgentConnectivityWatchdog(store: ControlPlaneStore): NodeAgentConnectivityWatchdog {
    return new NodeAgentConnectivityWatchdog(store);
}
