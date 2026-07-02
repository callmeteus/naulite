import type { ExecutionOperation, Instance, Node } from "@platform/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import type { ControlPlaneContext } from "../ControlPlaneContext";
import type { PlannerDiff } from "../orchestration/Planner";

import { AgentDispatcher } from "./AgentDispatcher";

/**
 * Result of applying a manifest through the control plane.
 */
export interface ApplyResult {
    revision: number;
    manifestName: string;
    diff: {
        servicesToCreate: number;
        servicesToUpdate: number;
        servicesToRemove: number;
        instancesToCreate: number;
        instancesToRemove: number;
        volumesToEnsure: number;
        volumesToRemove: number;
    };
    exposurePlan: ReturnType<ControlPlaneContext["exposurePlanner"]["plan"]>;
    plans: ReturnType<ControlPlaneContext["planner"]["buildExecutionPlan"]>[];
    dispatch: Awaited<ReturnType<typeof AgentDispatcher.dispatchPlans>>;
}

/**
 * Options for manifest apply execution.
 */
export interface ApplyExecuteOptions {
    repositoryUrl?: string;
    branch?: string;
    commitSha?: string;
    rolledBackFromId?: string;
}

/**
 * Orchestrates manifest parse, diff, persistence, exposure, and agent dispatch.
 */
export namespace ApplyService {
    /**
     * Parses and applies a manifest YAML, dispatching execution plans to agents.
     *
     * @param manifestYaml Manifest document body
     * @param options Optional Git metadata for revision recording
     * @returns Apply summary including dispatch results
     */
    export async function execute(
        manifestYaml: string,
        options: ApplyExecuteOptions = {}
    ): Promise<ApplyResult> {
        const manifest = ControlPlaneService.Orchestration.ComposeParser.parse(manifestYaml);
        const [services, instances, volumes, nodes] = await Promise.all([
            ControlPlaneService.Store.listServices(),
            ControlPlaneService.Store.listInstances(),
            ControlPlaneService.Store.listVolumes(),
            ControlPlaneService.Store.listNodes()
        ]);

        const diff = ControlPlaneService.Orchestration.Planner.diff(manifest, {
            services,
            instances,
            volumes
        });

        ControlPlaneService.Apply.incrementRevision();

        const instanceNodes = buildInstanceNodeMap(instances, diff);

        for (const service of [...diff.servicesToCreate, ...diff.servicesToUpdate]) {
            const manifestService = manifest.services[service.name];
            await ControlPlaneService.Store.upsertService(service);

            const schedule = ControlPlaneService.Orchestration.Scheduler.schedule(
                service,
                manifestService,
                nodes
            );

            if (schedule) {
                for (const instance of diff.instancesToCreate.filter((entry) => entry.serviceId === service.id)) {
                    const scheduled: Instance = {
                        ...instance,
                        nodeId: schedule.node.id,
                        updatedAt: new Date().toISOString()
                    };
                    instanceNodes.set(scheduled.id, scheduled.nodeId);
                    await ControlPlaneService.Store.insertInstance(scheduled);
                }
            }
        }

        for (const volume of diff.volumesToEnsure) {
            await ControlPlaneService.Store.insertVolume(volume);
        }

        for (const service of diff.servicesToRemove) {
            await ControlPlaneService.Store.deleteService(service.id);
        }

        const exposures = ControlPlaneService.Orchestration.ComposeParser.extractInternalExposures(manifest);
        const exposurePlan = ControlPlaneService.Orchestration.Exposure.plan(manifest, exposures);

        for (const entry of exposurePlan.entries) {
            await ControlPlaneService.NetBird.ensureInternalGroup(entry.netbirdGroupName);
        }

        await ControlPlaneService.GitOps.recordRevision(
            {
                repositoryUrl: options.repositoryUrl ?? "inline://apply",
                branch: options.branch ?? "main",
                commitSha: options.commitSha ?? `rev-${ControlPlaneService.Apply.getRevision()}`,
                overlayPaths: []
            },
            manifestYaml,
            manifest,
            options.rolledBackFromId
        );

        await ControlPlaneService.Sync.publish("apply", {
            manifestName: manifest.name,
            revision: ControlPlaneService.Apply.getRevision()
        });

        const operations = addPullOperations(diff.operations);
        const plans = nodes.map((node) => {
            const nodeOperations = filterOperationsForNode(node.id, operations, instanceNodes, nodes);
            return ControlPlaneService.Orchestration.Planner.buildExecutionPlan(
                manifest.name,
                node.id,
                ControlPlaneService.Apply.getRevision(),
                nodeOperations
            );
        });

        const dispatch = await AgentDispatcher.dispatchPlans(plans, nodes);

        return {
            revision: ControlPlaneService.Apply.getRevision(),
            manifestName: manifest.name,
            diff: {
                servicesToCreate: diff.servicesToCreate.length,
                servicesToUpdate: diff.servicesToUpdate.length,
                servicesToRemove: diff.servicesToRemove.length,
                instancesToCreate: diff.instancesToCreate.length,
                instancesToRemove: diff.instancesToRemove.length,
                volumesToEnsure: diff.volumesToEnsure.length,
                volumesToRemove: diff.volumesToRemove.length
            },
            exposurePlan,
            plans,
            dispatch
        };
    }

    /**
     * Builds a map of instance id to scheduled node id for operation filtering.
     *
     * @param existingInstances Instances already stored in the cluster
     * @param diff Planner diff for the current apply
     * @returns Instance id to node id map
     */
    function buildInstanceNodeMap(
        existingInstances: Instance[],
        diff: PlannerDiff
    ): Map<string, string> {
        const instanceNodes = new Map<string, string>();

        for (const instance of existingInstances) {
            instanceNodes.set(instance.id, instance.nodeId);
        }

        for (const instance of diff.instancesToRemove) {
            instanceNodes.set(instance.id, instance.nodeId);
        }

        for (const instance of diff.instancesToCreate) {
            instanceNodes.set(instance.id, instance.nodeId);
        }

        return instanceNodes;
    }

    /**
     * Inserts image pull operations before create operations.
     *
     * @param operations Planner operations
     * @returns Operations with pull steps prepended
     */
    function addPullOperations(operations: ExecutionOperation[]): ExecutionOperation[] {
        const output: ExecutionOperation[] = [];
        const pulledImages = new Set<string>();

        for (const operation of operations) {
            if (operation.type === "create" && !pulledImages.has(operation.image)) {
                output.push({
                    type: "pull",
                    image: operation.image
                });
                pulledImages.add(operation.image);
            }

            output.push(operation);
        }

        return output;
    }

    /**
     * Filters planner operations to those that should run on a single node.
     *
     * @param nodeId Target node id
     * @param operations Full operation list
     * @param instanceNodes Instance id to node id map
     * @param nodes Registered nodes
     * @returns Operations for the target node
     */
    export function filterOperationsForNode(
        nodeId: string,
        operations: ExecutionOperation[],
        instanceNodes: Map<string, string>,
        nodes: Node[]
    ): ExecutionOperation[] {
        const nodeIdsWithWork = new Set(instanceNodes.values());
        const shouldReceiveVolumeOps = nodeIdsWithWork.has(nodeId) || nodes.length === 1;

        return operations.filter((operation) => {
            return switchOperation(nodeId, operation, instanceNodes, shouldReceiveVolumeOps);
        });
    }

    /**
     * Decides whether an operation belongs on the target node.
     *
     * @param nodeId Target node id
     * @param operation Runtime operation
     * @param instanceNodes Instance id to node id map
     * @param shouldReceiveVolumeOps Whether volume ops should run on this node
     * @returns True when the operation targets the node
     */
    function switchOperation(
        nodeId: string,
        operation: ExecutionOperation,
        instanceNodes: Map<string, string>,
        shouldReceiveVolumeOps: boolean
    ): boolean {
        switch (operation.type) {
            case "ensureVolume":
                return shouldReceiveVolumeOps;
            case "pull":
            case "create":
            case "start":
            case "stop":
            case "remove":
            case "connectNetwork":
            case "disconnectNetwork": {
                const instanceId = "instanceId" in operation ? operation.instanceId : null;
                if (!instanceId) {
                    return false;
                }

                return instanceNodes.get(instanceId) === nodeId;
            }
        }
    }
}
