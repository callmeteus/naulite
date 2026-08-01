import type { Instance, Node } from "@naulite/shared";

import { Logger } from "../Logger";
import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import type { ComposeParser } from "../orchestration/ComposeParser";
import { Planner } from "../orchestration/Planner";
import { AgentDispatcher } from "./AgentDispatcher";
import { explainDispatchFailure } from "./ApplyDispatchFailureMessage";
import { ApplyService } from "./ApplyService";
import { GitOpsService } from "./GitOpsService";
import type { LeaderElection } from "./LeaderElection";

const logInstanceReconcile = Logger.create("instance-reconcile");

/**
 * Default instance reconciliation poll interval in milliseconds.
 */
const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;

/**
 * Grace period before retrying a failed instance reconcile in milliseconds.
 */
const DEFAULT_RECONCILE_GRACE_MS = 15_000;

/**
 * Maximum reconcile attempts before an instance is marked failed.
 */
const DEFAULT_MAX_RETRIES = 5;

export type InstanceReconcileOutcome = {
    instanceId: string;
    status: "dispatched" | "skipped" | "failed";
    message?: string;
};

export type ServiceReconcileOutcome = {
    serviceName: string;
    results: InstanceReconcileOutcome[];
};

type ReconcileOptions = {
    force?: boolean;
};

/**
 * Re-dispatches workload instances stuck in pending or failed status.
 */
export class InstanceReconcilerService {
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Creates the instance reconciler service.
     *
     * @param store Control plane persistence layer
     * @param planner Planner used to build deploy operations
     * @param composeParser Manifest parser for stored GitOps revisions
     * @param resolveApplyRevision Resolver for the current apply revision counter
     */
    constructor(
        private readonly store: ControlPlaneStore,
        private readonly planner: Planner,
        private readonly composeParser: ComposeParser,
        private readonly resolveApplyRevision: () => number
    ) {}

    /**
     * Starts leader-only polling for instances that need redeployment.
     *
     * @param leaderElection Leader election service
     * @param intervalMs Poll interval in milliseconds
     * @returns Nothing.
     */
    startPolling(leaderElection: LeaderElection, intervalMs = DEFAULT_RECONCILE_INTERVAL_MS): void {
        if (this.pollTimer) {
            return;
        }

        this.pollTimer = setInterval(() => {
            if (!leaderElection.isLeader()) {
                return;
            }

            void this.reconcileAll().catch((err) => {
                logInstanceReconcile.error("poll failed: %O", err);
            });
        }, intervalMs);

        console.debug("[instance-reconcile] polling started intervalMs=%d", intervalMs);
    }

    /**
     * Stops instance reconciliation polling.
     *
     * @returns Nothing.
     */
    stop(): void {
        if (!this.pollTimer) {
            return;
        }

        clearInterval(this.pollTimer);
        this.pollTimer = null;
        console.debug("[instance-reconcile] polling stopped");
    }

    /**
     * Reconciles every eligible instance in the cluster.
     *
     * @returns Nothing.
     */
    async reconcileAll(): Promise<void> {
        const [instances, nodes] = await Promise.all([
            this.store.listInstances(),
            this.store.listNodes()
        ]);

        const now = new Date();

        for (const instance of instances) {
            if (!InstanceReconcilerService.isReconcileCandidate(instance, nodes, now)) {
                continue;
            }

            await this.reconcileInstance(instance.id, instances, nodes);
        }
    }

    /**
     * Reconciles pending or failed instances scheduled on a node.
     *
     * @param nodeId Node identifier
     * @returns Nothing.
     */
    async reconcileNode(nodeId: string): Promise<void> {
        const [instances, nodes] = await Promise.all([
            this.store.listInstances(),
            this.store.listNodes()
        ]);

        const now = new Date();

        for (const instance of instances) {
            if (instance.nodeId !== nodeId) {
                continue;
            }

            if (!InstanceReconcilerService.isReconcileCandidate(instance, nodes, now)) {
                continue;
            }

            await this.reconcileInstance(instance.id, instances, nodes);
        }
    }

    /**
     * Re-dispatches pending or failed instances for a service.
     *
     * @param serviceName Service name
     * @param options Reconcile options
     * @returns Per-instance reconcile outcomes
     */
    async reconcileService(
        serviceName: string,
        options?: ReconcileOptions
    ): Promise<ServiceReconcileOutcome> {
        const services = await this.store.listServices();
        const service = services.find((entry) => entry.name === serviceName);

        if (!service) {
            return {
                serviceName,
                results: []
            };
        }

        const [instances, nodes] = await Promise.all([
            this.store.listInstances(),
            this.store.listNodes()
        ]);

        const targets = instances.filter((instance) => {
            return instance.serviceId === service.id
                && (instance.status === "pending" || instance.status === "failed");
        });

        const results: InstanceReconcileOutcome[] = [];

        for (const instance of targets) {
            results.push(await this.reconcileInstance(instance.id, instances, nodes, options));
        }

        return {
            serviceName,
            results
        };
    }

    /**
     * Re-dispatches a single instance to its scheduled node agent.
     *
     * @param instanceId Instance identifier
     * @param instances Cached instance list
     * @param nodes Cached node list
     * @param options Reconcile options
     * @returns Reconcile outcome for the instance
     */
    async reconcileInstance(
        instanceId: string,
        instances?: Instance[],
        nodes?: Node[],
        options?: ReconcileOptions
    ): Promise<InstanceReconcileOutcome> {
        const instanceList = instances ?? await this.store.listInstances();
        const nodeList = nodes ?? await this.store.listNodes();
        const instance = instanceList.find((entry) => entry.id === instanceId);

        if (!instance) {
            return {
                instanceId,
                status: "skipped",
                message: "Instance not found."
            };
        }

        const now = new Date();

        if (!InstanceReconcilerService.isReconcileCandidate(instance, nodeList, now, options)) {
            return {
                instanceId,
                status: "skipped",
                message: InstanceReconcilerService.describeSkipReason(instance, nodeList, now, options)
            };
        }

        const node = nodeList.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl) {
            return {
                instanceId,
                status: "skipped",
                message: "Scheduled node has no agent URL."
            };
        }

        const services = await this.store.listServices();
        const service = services.find((entry) => entry.id === instance.serviceId);

        if (!service) {
            return {
                instanceId,
                status: "skipped",
                message: "Service not found."
            };
        }

        const revisions = (await GitOpsService.listRevisions(service.manifestName))
            .sort((left, right) => right.appliedAt.localeCompare(left.appliedAt));

        const latestRevision = revisions[0];

        if (!latestRevision) {
            console.debug(
                "[instance-reconcile] skip instanceId=%s manifest=%s reason=no_revision",
                instanceId,
                service.manifestName
            );

            return {
                instanceId,
                status: "skipped",
                message: "No GitOps revision found for the service manifest."
            };
        }

        const manifest = this.composeParser.parse(latestRevision.manifestYaml);
        const operations = ApplyService.addPullOperations(
            Planner.buildInstanceDeployOperations(manifest, instance)
        );

        const plan = this.planner.buildExecutionPlan(
            manifest.name,
            node.id,
            this.resolveApplyRevision(),
            operations
        );

        const dispatch = await AgentDispatcher.dispatchPlans([plan], [node]);
        const result = dispatch[0];
        const attempts = (instance.dispatchAttempts ?? 0) + 1;
        const timestamp = now.toISOString();
        const maxRetries = InstanceReconcilerService.resolveMaxRetries();

        if (result?.status === "dispatched") {
            await this.store.updateInstance(instanceId, {
                status: "pending",
                dispatchAttempts: attempts,
                lastDispatchedAt: timestamp,
                lastError: null
            });

            console.debug("[instance-reconcile] dispatched instanceId=%s nodeId=%s attempt=%d",
                instanceId,
                node.id,
                attempts
            );

            return {
                instanceId,
                status: "dispatched"
            };
        }

        const failureMessage = result
            ? explainDispatchFailure(result)
            : "Reconcile dispatch failed.";

        await this.store.updateInstance(instanceId, {
            status: "failed",
            dispatchAttempts: attempts,
            lastDispatchedAt: timestamp,
            lastError: failureMessage
        });

        console.debug(
            "[instance-reconcile] dispatch failed instanceId=%s nodeId=%s attempt=%d maxRetries=%d err=%s",
            instanceId,
            node.id,
            attempts,
            maxRetries,
            failureMessage
        );

        return {
            instanceId,
            status: "failed",
            message: failureMessage
        };
    }

    /**
     * Returns whether an instance should be retried by the reconciler.
     *
     * @param instance Instance record
     * @param nodes Registered nodes
     * @param now Current timestamp
     * @param options Reconcile options
     * @returns True when the instance is eligible for redeployment
     */
    static isReconcileCandidate(
        instance: Instance,
        nodes: Node[],
        now: Date,
        options?: ReconcileOptions
    ): boolean {
        if (instance.status !== "pending" && instance.status !== "failed") {
            return false;
        }

        if (!options?.force
            && (instance.dispatchAttempts ?? 0) >= InstanceReconcilerService.resolveMaxRetries()) {
            return false;
        }

        const node = nodes.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl || node.status === "offline") {
            return false;
        }

        if (options?.force) {
            return true;
        }

        const referenceTime = instance.lastDispatchedAt ?? instance.updatedAt;
        const elapsedMs = now.getTime() - new Date(referenceTime).getTime();

        return elapsedMs >= InstanceReconcilerService.reconcileBackoffMs(instance.dispatchAttempts ?? 0);
    }

    /**
     * Describes why an instance was not eligible for reconciliation.
     *
     * @param instance Instance record
     * @param nodes Registered nodes
     * @param now Current timestamp
     * @param options Reconcile options
     * @returns Human-readable skip reason
     */
    static describeSkipReason(
        instance: Instance,
        nodes: Node[],
        now: Date,
        options?: ReconcileOptions
    ): string {
        if (instance.status !== "pending" && instance.status !== "failed") {
            return `Instance status is ${instance.status}.`;
        }

        if (!options?.force
            && (instance.dispatchAttempts ?? 0) >= InstanceReconcilerService.resolveMaxRetries()) {
            return "Maximum dispatch attempts reached.";
        }

        const node = nodes.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl) {
            return "Scheduled node has no agent URL.";
        }

        if (node.status === "offline") {
            return "Scheduled node is offline.";
        }

        if (options?.force) {
            return "Instance is not eligible for reconciliation.";
        }

        const referenceTime = instance.lastDispatchedAt ?? instance.updatedAt;
        const elapsedMs = now.getTime() - new Date(referenceTime).getTime();
        const backoffMs = InstanceReconcilerService.reconcileBackoffMs(instance.dispatchAttempts ?? 0);

        if (elapsedMs < backoffMs) {
            return "Backoff period has not elapsed yet.";
        }

        return "Instance is not eligible for reconciliation.";
    }

    /**
     * Computes exponential backoff before the next reconcile attempt.
     *
     * @param attempts Number of prior dispatch attempts
     * @returns Backoff duration in milliseconds
     */
    static reconcileBackoffMs(attempts: number): number {
        const baseMs = Number(process.env.NAULITE_INSTANCE_RECONCILE_GRACE_MS ?? DEFAULT_RECONCILE_GRACE_MS);
        return baseMs * (2 ** Math.min(attempts, 5));
    }

    /**
     * Resolves the maximum number of dispatch attempts per instance.
     *
     * @returns Maximum retry count
     */
    static resolveMaxRetries(): number {
        return Number(process.env.NAULITE_INSTANCE_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
    }
}

/**
 * Creates an instance reconciler service.
 *
 * @param store Control plane persistence layer
 * @param planner Planner used to build deploy operations
 * @param composeParser Manifest parser for stored GitOps revisions
 * @param resolveApplyRevision Resolver for the current apply revision counter
 * @returns Instance reconciler service
 */
export function createInstanceReconcilerService(
    store: ControlPlaneStore,
    planner: Planner,
    composeParser: ComposeParser,
    resolveApplyRevision: () => number
): InstanceReconcilerService {
    return new InstanceReconcilerService(store, planner, composeParser, resolveApplyRevision);
}
