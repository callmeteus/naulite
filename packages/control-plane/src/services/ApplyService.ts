import type { ExecutionOperation, Instance, Manifest, ManifestService, Node, SecretFilter } from "@platform/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import type { ControlPlaneContext } from "../ControlPlaneContext";
import { HTTP503Error } from "../errors/TreatedError";
import { NetworkGroupId } from "../orchestration/NetworkGroupId";
import type { PlannerDiff } from "../orchestration/Planner";
import type { LocalSecretProvider } from "../modules/secrets/LocalSecretProvider";

import { AgentDispatcher } from "./AgentDispatcher";
import { BuildService } from "./BuildService";

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
    buildContextRoot?: string;
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
        const context = ControlPlaneService.requireContext();
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

        await ControlPlaneService.Apply.incrementRevision();

        const instanceNodes = buildInstanceNodeMap(instances, diff);

        for (const service of [...diff.servicesToCreate, ...diff.servicesToUpdate]) {
            const manifestService = manifest.services[service.name];
            const newInstances = diff.instancesToCreate.filter((entry) => entry.serviceId === service.id);

            if (newInstances.length > 0) {
                const schedule = ControlPlaneService.Orchestration.Scheduler.schedule(
                    service,
                    manifestService,
                    nodes
                );

                if (!schedule) {
                    console.debug("[apply] schedule failed service=%s nodes=%d", service.name, nodes.length);
                    throw new HTTP503Error(`No eligible node found for service "${service.name}".`, {
                        serviceName: service.name
                    });
                }

                for (const instance of newInstances) {
                    const scheduled: Instance = {
                        ...instance,
                        nodeId: schedule.node.id,
                        updatedAt: new Date().toISOString()
                    };
                    instanceNodes.set(scheduled.id, scheduled.nodeId);
                    await ControlPlaneService.Store.insertInstance(scheduled);
                }
            }

            await ControlPlaneService.Store.upsertService(service);
        }

        for (const instance of diff.instancesToRemove) {
            await ControlPlaneService.Store.deleteInstance(instance.id);
        }

        for (const service of diff.servicesToRemove) {
            await ControlPlaneService.Store.deleteService(service.id);
        }

        for (const volume of diff.volumesToRemove) {
            await ControlPlaneService.Store.deleteVolumeByName(volume.name);
        }

        const volumeNodeAssignments = buildVolumeNodeAssignments(manifest, diff, instanceNodes);

        for (const volume of diff.volumesToEnsure) {
            const nodeId = volumeNodeAssignments.get(volume.name);
            await ControlPlaneService.Store.insertVolume({
                ...volume,
                nodeId
            });
        }

        const exposures = ControlPlaneService.Orchestration.ComposeParser.extractInternalExposures(manifest);
        const exposurePlan = ControlPlaneService.Orchestration.Exposure.plan(manifest, exposures);

        await provisionNetBirdResources(manifest, exposurePlan.entries, nodes);

        await provisionPublicIngressRoutes(manifest, nodes, instanceNodes);

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

        const resolvedOperations = await BuildService.resolveBuildOperations(
            context,
            manifest,
            diff.operations,
            nodes,
            {
                buildContextRoot: options.buildContextRoot
                    ?? process.env.PLATFORM_BUILD_CONTEXT_ROOT?.trim()
            }
        );
        const operations = await enrichOperationsWithSecrets(
            addPullOperations(resolvedOperations),
            manifest,
            context.secretProvider
        );
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
     * Resolves node assignments for newly ensured volumes.
     *
     * @param manifest Parsed manifest
     * @param diff Planner diff for the current apply
     * @param instanceNodes Instance id to node id map
     * @returns Volume name to node id map
     */
    function buildVolumeNodeAssignments(
        manifest: Manifest,
        diff: PlannerDiff,
        instanceNodes: Map<string, string>
    ): Map<string, string> {
        const assignments = new Map<string, string>();

        for (const volume of diff.volumesToEnsure) {
            const serviceName = findServiceMountingVolume(manifest, volume.name);
            const scheduledInstance = diff.instancesToCreate.find((instance) => instance.serviceName === serviceName);
            const nodeId = scheduledInstance ? instanceNodes.get(scheduledInstance.id) : undefined;

            if (nodeId && nodeId !== "unscheduled") {
                assignments.set(volume.name, nodeId);
            }
        }

        return assignments;
    }

    /**
     * Finds the first manifest service that mounts a volume.
     *
     * @param manifest Parsed manifest
     * @param volumeName Volume name
     * @returns Service name when found
     */
    function findServiceMountingVolume(manifest: Manifest, volumeName: string): string | undefined {
        for (const [serviceName, service] of Object.entries(manifest.services)) {
            if (!service.volumes) {
                continue;
            }

            const mountsVolume = service.volumes.some((entry) => entry.split(":")[0] === volumeName);
            if (mountsVolume) {
                return serviceName;
            }
        }

        return undefined;
    }

    /**
     * Resolves secret payloads for create operations before agent dispatch.
     *
     * @param operations Planner operations
     * @param manifest Parsed manifest
     * @param secretProvider Local secret provider
     * @returns Operations with resolved secrets on create steps
     */
    async function enrichOperationsWithSecrets(
        operations: ExecutionOperation[],
        manifest: Manifest,
        secretProvider: LocalSecretProvider
    ): Promise<ExecutionOperation[]> {
        const enriched: ExecutionOperation[] = [];

        for (const operation of operations) {
            if (operation.type !== "create") {
                enriched.push(operation);
                continue;
            }

            const manifestService = manifest.services[operation.serviceName];
            const filter = buildSecretFilter(manifestService);

            if (filter.secretNames.length === 0) {
                enriched.push(operation);
                continue;
            }

            console.debug(
                "[apply] resolve secrets service=%s names=%o",
                operation.serviceName,
                filter.secretNames
            );
            const secrets = await secretProvider.resolveForAgent(filter);
            enriched.push({
                ...operation,
                secrets
            });
        }

        return enriched;
    }

    /**
     * Builds the secret filter for a manifest service.
     *
     * @param manifestService Manifest service definition
     * @returns Secret filter for agent delivery
     */
    function buildSecretFilter(manifestService: ManifestService | undefined): SecretFilter {
        const secretNames: string[] = [];
        const allowedKeys: Record<string, string[]> = {};

        for (const reference of manifestService?.secrets ?? []) {
            secretNames.push(reference.secretName);

            if (reference.key) {
                allowedKeys[reference.secretName] = [
                    ...(allowedKeys[reference.secretName] ?? []),
                    reference.key
                ];
            }
        }

        return {
            secretNames: [...new Set(secretNames)],
            allowedKeys: Object.keys(allowedKeys).length > 0 ? allowedKeys : undefined
        };
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
            if (
                operation.type === "create"
                && !operation.image.startsWith("build://")
                && !pulledImages.has(operation.image)
            ) {
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

    /**
     * Ensures NetBird groups, ACLs, and node peer membership for a manifest apply.
     *
     * @param manifest Applied manifest
     * @param exposureEntries Internal exposure plan entries
     * @param nodes Registered cluster nodes
     * @returns Nothing.
     */
    async function provisionNetBirdResources(
        manifest: Manifest,
        exposureEntries: ReturnType<ControlPlaneContext["exposurePlanner"]["plan"]>["entries"],
        nodes: Node[]
    ): Promise<void> {
        for (const [networkKey, network] of Object.entries(manifest.networks ?? {})) {
            if (network.local) {
                continue;
            }

            const groupName = NetworkGroupId.build(manifest.name, networkKey);
            const group = await ControlPlaneService.NetBird.ensureInternalGroup(groupName);
            await ControlPlaneService.NetBird.ensureGroupAccessPolicy(
                group.id,
                `platform-network-${groupName}`
            );
        }

        for (const entry of exposureEntries) {
            const group = await ControlPlaneService.NetBird.ensureInternalGroup(entry.netbirdGroupName);
            await ControlPlaneService.NetBird.ensureGroupAccessPolicy(
                group.id,
                `platform-exposure-${entry.netbirdGroupName}`,
                [String(entry.exposure.port)]
            );
        }

        const peerIds = nodes
            .map((node) => node.netbirdDeviceId)
            .filter((peerId): peerId is string => Boolean(peerId));

        await ControlPlaneService.NetBird.syncPlatformNodePeers(peerIds);
    }

    /**
     * Publishes public ingress routes through the gateway provider.
     *
     * @param manifest Applied manifest
     * @param nodes Registered cluster nodes
     * @param instanceNodes Instance id to node id map
     * @returns Nothing.
     */
    async function provisionPublicIngressRoutes(
        manifest: Manifest,
        nodes: Node[],
        instanceNodes: Map<string, string>
    ): Promise<void> {
        for (const [serviceName, service] of Object.entries(manifest.services)) {
            if (!service.ingress || service.ingress.exposure !== "public") {
                continue;
            }

            const target = resolveIngressTarget(manifest.name, serviceName, service, nodes, instanceNodes);
            if (!target) {
                console.debug(
                    "[apply] skip public ingress service=%s reason=no-scheduled-instance",
                    serviceName
                );
                continue;
            }

            const pathRule = service.ingress.paths[0];
            await ControlPlaneService.Gateway.upsertRoute({
                serviceName,
                ingress: service.ingress,
                targetHost: target.hostname,
                targetPort: pathRule.port
            });

            if (service.ingress.tls?.enabled) {
                await ControlPlaneService.Gateway.requestAutoTls(service.ingress.host);
            }
        }
    }

    /**
     * Resolves the node hostname that should receive public ingress traffic.
     *
     * @param manifestName Manifest name
     * @param serviceName Service name
     * @param service Manifest service definition
     * @param nodes Registered cluster nodes
     * @param instanceNodes Instance id to node id map
     * @returns Target hostname when an instance is scheduled
     */
    function resolveIngressTarget(
        manifestName: string,
        serviceName: string,
        _service: ManifestService,
        nodes: Node[],
        instanceNodes: Map<string, string>
    ): Node | undefined {
        const serviceId = `${manifestName}:${serviceName}`;
        const scheduledNodeId = [...instanceNodes.entries()].find(([instanceId]) => {
            return instanceId.startsWith(`${serviceId}:`) || instanceId.startsWith(`${manifestName}:${serviceName}`);
        })?.[1];

        if (scheduledNodeId) {
            return nodes.find((node) => node.id === scheduledNodeId);
        }

        if (nodes.length === 1) {
            return nodes[0];
        }

        return nodes.find((node) => node.status === "online") ?? nodes[0];
    }
}
