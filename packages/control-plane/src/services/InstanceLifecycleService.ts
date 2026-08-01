import type { ExecutionOperation, Instance } from "@naulite/shared";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import { Planner } from "../orchestration/Planner";
import { AgentDispatcher } from "./AgentDispatcher";
import { explainDispatchFailure } from "./ApplyDispatchFailureMessage";
import { ServiceStatusService } from "./ServiceStatusService";

export type InstanceLifecycleOutcome = {
    instanceId: string;
    status: "dispatched" | "failed";
    message?: string;
};

/**
 * Dispatches single-instance lifecycle operations to node agents.
 */
export namespace InstanceLifecycleService {
    /**
     * Stops a running instance on its scheduled node.
     *
     * @param store Control plane persistence layer
     * @param planner Execution planner
     * @param resolveApplyRevision Resolver for apply revision counter
     * @param instanceId Instance identifier
     * @returns Lifecycle dispatch outcome
     */
    export async function stopInstance(
        store: ControlPlaneStore,
        planner: Planner,
        resolveApplyRevision: () => number,
        instanceId: string
    ): Promise<InstanceLifecycleOutcome> {
        return dispatchLifecycleOperation(store, planner, resolveApplyRevision, instanceId, [
            { type: "stop", instanceId }
        ], "stopping");
    }

    /**
     * Starts a stopped instance on its scheduled node.
     *
     * @param store Control plane persistence layer
     * @param planner Execution planner
     * @param resolveApplyRevision Resolver for apply revision counter
     * @param instanceId Instance identifier
     * @returns Lifecycle dispatch outcome
     */
    export async function startInstance(
        store: ControlPlaneStore,
        planner: Planner,
        resolveApplyRevision: () => number,
        instanceId: string
    ): Promise<InstanceLifecycleOutcome> {
        return dispatchLifecycleOperation(store, planner, resolveApplyRevision, instanceId, [
            { type: "start", instanceId }
        ], "starting");
    }

    /**
     * Restarts a running instance by stopping and starting it again.
     *
     * @param store Control plane persistence layer
     * @param planner Execution planner
     * @param resolveApplyRevision Resolver for apply revision counter
     * @param instanceId Instance identifier
     * @returns Lifecycle dispatch outcome
     */
    export async function restartInstance(
        store: ControlPlaneStore,
        planner: Planner,
        resolveApplyRevision: () => number,
        instanceId: string
    ): Promise<InstanceLifecycleOutcome> {
        return dispatchLifecycleOperation(store, planner, resolveApplyRevision, instanceId, [
            { type: "stop", instanceId },
            { type: "start", instanceId }
        ], "starting");
    }

    /**
     * Removes an instance from its node and deletes the control plane record.
     *
     * @param store Control plane persistence layer
     * @param planner Execution planner
     * @param resolveApplyRevision Resolver for apply revision counter
     * @param instanceId Instance identifier
     * @returns Lifecycle dispatch outcome
     */
    export async function removeInstance(
        store: ControlPlaneStore,
        planner: Planner,
        resolveApplyRevision: () => number,
        instanceId: string
    ): Promise<InstanceLifecycleOutcome> {
        const instance = await resolveInstance(store, instanceId);

        if (!instance) {
            return {
                instanceId,
                status: "failed",
                message: "Instance not found."
            };
        }

        const operations: ExecutionOperation[] = [
            { type: "stop", instanceId },
            { type: "remove", instanceId, force: true }
        ];

        const outcome = await dispatchLifecycleOperation(
            store,
            planner,
            resolveApplyRevision,
            instanceId,
            operations,
            "removing",
            false
        );

        if (outcome.status !== "dispatched") {
            return outcome;
        }

        const serviceId = instance.serviceId;
        await store.deleteInstance(instanceId);
        await ServiceStatusService.syncFromInstances(serviceId);

        return outcome;
    }

    /**
     * Resolves an instance by identifier.
     *
     * @param store Control plane persistence layer
     * @param instanceId Instance identifier
     * @returns Instance record when found
     */
    async function resolveInstance(
        store: ControlPlaneStore,
        instanceId: string
    ): Promise<Instance | null> {
        return store.getInstance(instanceId);
    }

    /**
     * Dispatches lifecycle operations to the instance node agent.
     *
     * @param store Control plane persistence layer
     * @param planner Execution planner
     * @param resolveApplyRevision Resolver for apply revision counter
     * @param instanceId Instance identifier
     * @param operations Lifecycle operations to dispatch
     * @param pendingStatus Status to persist before dispatch
     * @param updateOnSuccess Whether to update instance status after dispatch
     * @returns Lifecycle dispatch outcome
     */
    async function dispatchLifecycleOperation(
        store: ControlPlaneStore,
        planner: Planner,
        resolveApplyRevision: () => number,
        instanceId: string,
        operations: ExecutionOperation[],
        pendingStatus: Instance["status"],
        updateOnSuccess = true
    ): Promise<InstanceLifecycleOutcome> {
        const instance = await resolveInstance(store, instanceId);

        if (!instance) {
            return {
                instanceId,
                status: "failed",
                message: "Instance not found."
            };
        }

        const nodes = await store.listNodes();
        const node = nodes.find((entry) => entry.id === instance.nodeId);

        if (!node?.agentUrl) {
            return {
                instanceId,
                status: "failed",
                message: "Scheduled node has no agent URL."
            };
        }

        const services = await store.listServices();
        const service = services.find((entry) => entry.id === instance.serviceId);
        const manifestName = service?.manifestName ?? "lifecycle";

        const plan = planner.buildExecutionPlan(
            manifestName,
            node.id,
            resolveApplyRevision(),
            operations
        );

        const dispatch = await AgentDispatcher.dispatchPlans([plan], [node]);
        const result = dispatch[0];

        if (result?.status === "dispatched") {
            if (updateOnSuccess) {
                await store.updateInstance(instanceId, {
                    status: pendingStatus,
                    lastError: null
                });

                await ServiceStatusService.syncFromInstances(instance.serviceId);
            }

            return {
                instanceId,
                status: "dispatched"
            };
        }

        const failureMessage = result
            ? explainDispatchFailure(result)
            : "Lifecycle dispatch failed.";

        await store.updateInstance(instanceId, {
            status: "failed",
            lastError: failureMessage
        });

        await ServiceStatusService.syncFromInstances(instance.serviceId);

        return {
            instanceId,
            status: "failed",
            message: failureMessage
        };
    }
}
