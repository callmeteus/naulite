import type {
    ExecutionOperation,
    ExecutionPlan,
    Instance,
    Manifest,
    ManifestService,
    Service,
    Volume
} from "@naulite/shared";
import { isContainerRegistryRef } from "@naulite/shared";

/**
 * Resource diff between desired and actual cluster state.
 */
export interface PlannerDiff {
    servicesToCreate: Service[];
    servicesToUpdate: Service[];
    servicesToRemove: Service[];
    instancesToCreate: Instance[];
    instancesToRedeploy: Instance[];
    instancesToRemove: Instance[];
    volumesToEnsure: Volume[];
    volumesToRemove: Volume[];
    operations: ExecutionOperation[];
}

/**
 * Actual cluster state used for planning.
 */
export interface ClusterActualState {
    services: Service[];
    instances: Instance[];
    volumes: Volume[];
}

/**
 * Plans changes required to reconcile desired manifest state with actual state.
 */
export class Planner {
    /**
     * Builds a diff between desired manifest state and actual cluster resources.
     *
     * @param manifest Desired manifest to apply
     * @param actual Current cluster resources
     * @returns Planner diff with create, update, and remove actions
     */
    diff(manifest: Manifest, actual: ClusterActualState): PlannerDiff {
        const desiredServices = Planner.buildDesiredServices(manifest);
        const desiredServiceIds = new Set(desiredServices.map((service) => service.id));
        const actualByName = new Map(actual.services.map((service) => [service.name, service]));

        const servicesToCreate = desiredServices.filter((service) => !actualByName.has(service.name));
        const servicesToUpdate = desiredServices.filter((service) => {
            const current = actualByName.get(service.name);

            if (!current) {
                return false;
            }

            const manifestService = manifest.services[service.name];
            return Planner.serviceNeedsUpdate(current, service, manifestService);
        });

        const servicesToRemove = actual.services.filter((service) => {
            return service.manifestName === manifest.name && !desiredServiceIds.has(service.id);
        });

        const instancesToRemove: Instance[] = [];
        const instancesToCreate: Instance[] = [];
        const now = new Date().toISOString();

        for (const service of servicesToRemove) {
            instancesToRemove.push(...actual.instances.filter((instance) => instance.serviceId === service.id));
        }

        for (const service of servicesToCreate) {
            instancesToCreate.push(...Planner.buildInstances(service, service.desiredReplicas, now));
        }

        for (const service of servicesToUpdate) {
            const manifestService = manifest.services[service.name];
            const current = actualByName.get(service.name);
            const existingInstances = actual.instances.filter((instance) => instance.serviceId === service.id);
            const recreate = current
                ? Planner.serviceNeedsRecreate(current, service, manifestService)
                : true;

            if (recreate) {
                instancesToRemove.push(...existingInstances);
                instancesToCreate.push(...Planner.buildInstances(service, service.desiredReplicas, now));
            } else {
                const scaleDelta = service.desiredReplicas - existingInstances.length;

                if (scaleDelta > 0) {
                    instancesToCreate.push(
                        ...Planner.buildScaledInstances(service, scaleDelta, existingInstances, now)
                    );
                } else
                if (scaleDelta < 0) {
                    instancesToRemove.push(
                        ...Planner.pickInstancesToRetire(existingInstances, Math.abs(scaleDelta))
                    );
                }
            }
        }

        const desiredVolumes = Planner.buildDesiredVolumes(manifest);
        const actualVolumeNames = new Set(actual.volumes.map((volume) => volume.name));
        const volumesToEnsure = desiredVolumes.filter((volume) => !actualVolumeNames.has(volume.name));
        const volumesToRemove = actual.volumes.filter((volume) => {
            return volume.manifestName === manifest.name
                && !desiredVolumes.some((desired) => desired.name === volume.name);
        });

        const instancesToRemoveIds = new Set(instancesToRemove.map((instance) => instance.id));
        const instancesToCreateIds = new Set(instancesToCreate.map((instance) => instance.id));
        const instancesToRedeploy = actual.instances.filter((instance) => {
            if (instance.status !== "pending" && instance.status !== "failed") {
                return false;
            }

            if (instancesToRemoveIds.has(instance.id) || instancesToCreateIds.has(instance.id)) {
                return false;
            }

            return desiredServiceIds.has(instance.serviceId);
        });

        const operations = Planner.buildOperations(
            manifest,
            instancesToCreate,
            instancesToRedeploy,
            instancesToRemove,
            volumesToEnsure,
            volumesToRemove,
            actual.instances,
            servicesToUpdate,
            actualByName
        );

        return {
            servicesToCreate,
            servicesToUpdate,
            servicesToRemove,
            instancesToCreate,
            instancesToRedeploy,
            instancesToRemove,
            volumesToEnsure,
            volumesToRemove,
            operations
        };
    }

    /**
     * Builds an execution plan for a node from planner operations.
     *
     * @param manifestName Manifest being applied
     * @param nodeId Target node id
     * @param revision Git or apply revision number
     * @param operations Operations to include in the plan
     * @returns Execution plan for the node agent
     */
    buildExecutionPlan(
        manifestName: string,
        nodeId: string,
        revision: number,
        operations: ExecutionOperation[]
    ): ExecutionPlan {
        return {
            planId: `${manifestName}-${nodeId}-${revision}`,
            revision,
            nodeId,
            manifestName,
            operations,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Converts a manifest into desired service records.
     *
     * @param manifest Desired manifest
     * @returns Service records to persist
     */
    private static buildDesiredServices(manifest: Manifest): Service[] {
        const now = new Date().toISOString();

        return Object.entries(manifest.services).map(([serviceName, service]) => ({
            id: `${manifest.name}:${serviceName}`,
            name: serviceName,
            manifestName: manifest.name,
            image: Planner.resolveImage(service),
            desiredReplicas: Planner.resolveReplicas(service),
            status: "pending" as const,
            cluster: service.cluster ?? manifest.defaults?.cluster,
            capabilities: service.capabilities,
            networks: service.networks ?? [],
            ingress: service.ingress,
            logRotation: service.function ? undefined : (service.logRotation ?? manifest.defaults?.logRotation),
            deploySpec: Planner.buildDeploySpec(service),
            functionSpec: service.function,
            createdAt: now,
            updatedAt: now
        }));
    }

    /**
     * Converts manifest volumes into desired volume records.
     *
     * @param manifest Desired manifest
     * @returns Volume records to persist
     */
    private static buildDesiredVolumes(manifest: Manifest): Volume[] {
        const now = new Date().toISOString();

        return Object.entries(manifest.volumes).map(([volumeName, volume]) => ({
            id: `${manifest.name}:${volumeName}`,
            name: volumeName,
            manifestName: manifest.name,
            scope: "cluster" as const,
            mountPath: `/var/lib/naulite/${manifest.name}/${volumeName}`,
            status: "pending" as const,
            backup: volume.backup,
            createdAt: now,
            updatedAt: now
        }));
    }

    /**
     * Builds runtime operations to deploy a single instance.
     *
     * @param manifest Desired manifest
     * @param instance Instance to deploy
     * @returns Ordered create, network, and start operations
     */
    static buildInstanceDeployOperations(manifest: Manifest, instance: Instance): ExecutionOperation[] {
        const manifestService = manifest.services[instance.serviceName];
        const operations: ExecutionOperation[] = [];

        operations.push({
            type: "create",
            instanceId: instance.id,
            serviceName: instance.serviceName,
            image: instance.image,
            command: Planner.resolveCommand(manifestService),
            environment: manifestService?.environment ?? {},
            volumes: Planner.resolveVolumeMounts(manifestService),
            networks: manifestService?.networks ?? [],
            ports: Planner.resolvePorts(manifestService),
            secrets: []
        });

        for (const networkName of manifestService?.networks ?? []) {
            operations.push({
                type: "connectNetwork",
                instanceId: instance.id,
                networkName
            });
        }

        operations.push({
            type: "start",
            instanceId: instance.id
        });

        return operations;
    }

    /**
     * Builds runtime operations for the planner diff.
     *
     * @param manifest Desired manifest
     * @param instancesToCreate Instances that should be created
     * @param instancesToRedeploy Existing instances that should be retried
     * @param instancesToRemove Instances that should be removed
     * @param volumesToEnsure Volumes that should exist
     * @param volumesToRemove Volumes that should be deleted
     * @param existingInstances Instances before this apply
     * @param servicesToUpdate Services being updated in place
     * @param actualByName Current services keyed by name
     * @returns Ordered execution operations
     */
    private static buildOperations(
        manifest: Manifest,
        instancesToCreate: Instance[],
        instancesToRedeploy: Instance[],
        instancesToRemove: Instance[],
        volumesToEnsure: Volume[],
        volumesToRemove: Volume[],
        existingInstances: Instance[],
        servicesToUpdate: Service[],
        actualByName: Map<string, Service>
    ): ExecutionOperation[] {
        const operations: ExecutionOperation[] = [];
        const instancesToRemoveIds = new Set(instancesToRemove.map((instance) => instance.id));

        for (const instance of instancesToRemove) {
            operations.push({
                type: "stop",
                instanceId: instance.id
            });

            operations.push({
                type: "remove",
                instanceId: instance.id,
                force: true
            });
        }

        for (const volume of volumesToRemove) {
            operations.push({
                type: "removeVolume",
                volumeName: volume.name,
                force: false
            });
        }

        for (const volume of volumesToEnsure) {
            operations.push({
                type: "ensureVolume",
                volumeName: volume.name,
                mountPath: volume.mountPath
            });
        }

        for (const service of servicesToUpdate) {
            const current = actualByName.get(service.name);
            const manifestService = manifest.services[service.name];

            if (!current || !manifestService || Planner.serviceNeedsRecreate(current, service, manifestService)) {
                continue;
            }

            const survivingInstances = existingInstances.filter((instance) => {
                return instance.serviceId === service.id && !instancesToRemoveIds.has(instance.id);
            });

            const previousNetworks = current.networks ?? [];
            const nextNetworks = service.networks ?? [];
            const removedNetworks = previousNetworks.filter((network) => !nextNetworks.includes(network));
            const addedNetworks = nextNetworks.filter((network) => !previousNetworks.includes(network));

            for (const instance of survivingInstances) {
                for (const networkName of removedNetworks) {
                    operations.push({
                        type: "disconnectNetwork",
                        instanceId: instance.id,
                        networkName
                    });
                }

                for (const networkName of addedNetworks) {
                    operations.push({
                        type: "connectNetwork",
                        instanceId: instance.id,
                        networkName
                    });
                }
            }
        }

        for (const instance of instancesToCreate) {
            operations.push(...Planner.buildInstanceDeployOperations(manifest, instance));
        }

        for (const instance of instancesToRedeploy) {
            operations.push(...Planner.buildInstanceDeployOperations(manifest, instance));
        }

        return operations;
    }

    /**
     * Builds new instance records for a service.
     *
     * @param service Desired service
     * @param count Number of instances to create
     * @param now ISO timestamp for createdAt and updatedAt
     * @returns Instance records
     */
    private static buildInstances(service: Service, count: number, now: string): Instance[] {
        const instances: Instance[] = [];

        for (let replica = 0; replica < count; replica += 1) {
            instances.push({
                id: `${service.id}-${replica + 1}`,
                serviceId: service.id,
                serviceName: service.name,
                nodeId: "unscheduled",
                status: "pending",
                image: service.image,
                createdAt: now,
                updatedAt: now
            });
        }

        return instances;
    }

    /**
     * Builds instance records for a scale-up without recreating existing replicas.
     *
     * @param service Desired service
     * @param count Number of new instances to add
     * @param existingInstances Instances that remain scheduled
     * @param now ISO timestamp for createdAt and updatedAt
     * @returns New instance records
     */
    private static buildScaledInstances(
        service: Service,
        count: number,
        existingInstances: Instance[],
        now: string
    ): Instance[] {
        const prefix = `${service.id}-`;
        const usedIndexes = existingInstances
            .map((instance) => Number(instance.id.slice(prefix.length)))
            .filter((index) => Number.isInteger(index) && index > 0);

        let nextIndex = usedIndexes.length > 0 ? Math.max(...usedIndexes) + 1 : 1;
        const instances: Instance[] = [];

        for (let replica = 0; replica < count; replica += 1) {
            instances.push({
                id: `${service.id}-${nextIndex}`,
                serviceId: service.id,
                serviceName: service.name,
                nodeId: "unscheduled",
                status: "pending",
                image: service.image,
                createdAt: now,
                updatedAt: now
            });

            nextIndex += 1;
        }

        return instances;
    }

    /**
     * Selects the highest-index instances to retire during scale-down.
     *
     * @param existingInstances Current service instances
     * @param count Number of instances to retire
     * @returns Instances selected for removal
     */
    private static pickInstancesToRetire(existingInstances: Instance[], count: number): Instance[] {
        const prefix = `${existingInstances[0]?.serviceId ?? ""}-`;

        return [...existingInstances]
            .sort((left, right) => {
                const leftIndex = Number(left.id.slice(prefix.length));
                const rightIndex = Number(right.id.slice(prefix.length));
                return rightIndex - leftIndex;
            })
            .slice(0, count);
    }

    /**
     * Determines whether a service definition changed enough to require an update.
     *
     * @param current Current service state
     * @param desired Desired service state
     * @param manifestService Manifest service definition
     * @returns True when the service should be updated
     */
    private static serviceNeedsUpdate(
        current: Service,
        desired: Service,
        manifestService: ManifestService | undefined
    ): boolean {
        return Planner.serviceNeedsRecreate(current, desired, manifestService)
            || current.desiredReplicas !== desired.desiredReplicas
            || !Planner.valuesEqual(current.networks, desired.networks);
    }

    /**
     * Determines whether existing instances must be recreated.
     *
     * @param current Current service state
     * @param desired Desired service state
     * @param manifestService Manifest service definition
     * @returns True when instances should be replaced
     */
    private static serviceNeedsRecreate(
        current: Service,
        desired: Service,
        manifestService: ManifestService | undefined
    ): boolean {
        if (current.image !== desired.image) {
            return true;
        }

        if (!Planner.valuesEqual(current.ingress, desired.ingress)) {
            return true;
        }

        if (!Planner.valuesEqual(current.functionSpec, desired.functionSpec)) {
            return true;
        }

        const desiredSpec = Planner.buildDeploySpec(manifestService);
        return !Planner.valuesEqual(current.deploySpec, desiredSpec);
    }

    /**
     * Builds the deploy spec fingerprint stored on services.
     *
     * @param service Manifest service definition
     * @returns Deploy spec used for planner diffing
     */
    private static buildDeploySpec(service: ManifestService | undefined): NonNullable<Service["deploySpec"]> {
        return {
            command: Planner.resolveCommand(service),
            environment: service?.environment ?? {},
            ports: Planner.resolvePorts(service),
            secrets: service?.secrets ?? [],
            volumeMounts: Planner.resolveVolumeMounts(service)
        };
    }

    /**
     * Resolves replica count from a manifest service.
     *
     * @param service Manifest service definition
     * @returns Desired replica count
     */
    private static resolveReplicas(service: ManifestService): number {
        if (service.function) {
            return 0;
        }

        return service.deploy?.replicas ?? 1;
    }

    /**
     * Resolves the container image for a manifest service.
     *
     * @param service Manifest service definition
     * @returns Image reference or build placeholder
     */
    private static resolveImage(service: ManifestService): string {
        if (service.image) {
            return service.image;
        }

        if (typeof service.build === "string") {
            return `build://${service.build}`;
        }

        if (service.build && typeof service.build === "object") {
            if (service.build.image && isContainerRegistryRef(service.build.image)) {
                return service.build.image;
            }

            return `build://${service.build.context}`;
        }

        return "unknown";
    }

    /**
     * Resolves container command argv from a manifest service.
     *
     * @param service Manifest service definition
     * @returns Command argv
     */
    private static resolveCommand(service: ManifestService | undefined): string[] {
        if (!service?.command) {
            return [];
        }

        return Array.isArray(service.command)
            ? service.command
            : service.command.split(/\s+/);
    }

    /**
     * Resolves published ports from a manifest service.
     *
     * @param service Manifest service definition
     * @returns Port mappings for execution operations
     */
    private static resolvePorts(service: ManifestService | undefined) {
        if (!service?.ports) {
            return [];
        }

        return service.ports.map((port) => {
            if (typeof port === "string") {
                const [published, target] = port.split(":");
                return {
                    containerPort: Number(target ?? published),
                    hostPort: target ? Number(published) : undefined,
                    protocol: "tcp" as const
                };
            }

            return {
                containerPort: port.target,
                hostPort: port.published,
                protocol: port.protocol
            };
        });
    }

    /**
     * Resolves volume mounts declared on a manifest service.
     *
     * @param service Manifest service definition
     * @returns Volume mount definitions for create operations
     */
    private static resolveVolumeMounts(service: ManifestService | undefined) {
        if (!service?.volumes) {
            return [];
        }

        return service.volumes.map((entry) => {
            const [volumeName, mountPath, mode] = entry.split(":");
            return {
                volumeName,
                mountPath: mountPath ?? volumeName,
                readOnly: mode === "ro"
            };
        });
    }

    /**
     * Compares two JSON-serializable values for equality.
     *
     * @param left Left-hand value
     * @param right Right-hand value
     * @returns True when both values serialize to the same JSON
     */
    private static valuesEqual(left: unknown, right: unknown): boolean {
        return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
    }
}
