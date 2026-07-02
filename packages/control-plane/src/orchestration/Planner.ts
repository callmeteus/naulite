import type {
    ExecutionOperation,
    ExecutionPlan,
    Instance,
    Manifest,
    ManifestService,
    Service,
    Volume
} from "@platform/shared";

/**
 * Resource diff between desired and actual cluster state.
 */
export interface PlannerDiff {
    servicesToCreate: Service[];
    servicesToUpdate: Service[];
    servicesToRemove: Service[];
    instancesToCreate: Instance[];
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
            return current !== undefined && current.image !== service.image;
        });
        const servicesToRemove = actual.services.filter((service) => {
            return service.manifestName === manifest.name && !desiredServiceIds.has(service.id);
        });

        const instancesToRemove = actual.instances.filter((instance) => {
            return servicesToRemove.some((service) => service.id === instance.serviceId);
        });

        const instancesToCreate: Instance[] = [];
        const now = new Date().toISOString();

        for (const service of [...servicesToCreate, ...servicesToUpdate]) {
            for (let replica = 0; replica < service.desiredReplicas; replica += 1) {
                instancesToCreate.push({
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
        }

        const desiredVolumes = Planner.buildDesiredVolumes(manifest);
        const actualVolumeNames = new Set(actual.volumes.map((volume) => volume.name));
        const volumesToEnsure = desiredVolumes.filter((volume) => !actualVolumeNames.has(volume.name));
        const volumesToRemove = actual.volumes.filter((volume) => {
            return volume.manifestName === manifest.name
                && !desiredVolumes.some((desired) => desired.name === volume.name);
        });

        const operations: ExecutionOperation[] = [];

        for (const volume of volumesToEnsure) {
            operations.push({
                type: "ensureVolume",
                volumeName: volume.name,
                mountPath: volume.mountPath
            });
        }

        for (const instance of instancesToCreate) {
            const manifestService = manifest.services[instance.serviceName];

            operations.push({
                type: "create",
                instanceId: instance.id,
                serviceName: instance.serviceName,
                image: instance.image,
                command: Planner.resolveCommand(manifestService),
                environment: manifestService?.environment ?? {},
                volumes: [],
                networks: manifestService?.networks ?? [],
                ports: Planner.resolvePorts(manifestService),
                secrets: []
            });
            operations.push({
                type: "start",
                instanceId: instance.id
            });
        }

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

        return {
            servicesToCreate,
            servicesToUpdate,
            servicesToRemove,
            instancesToCreate,
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
            desiredReplicas: 1,
            status: "pending" as const,
            cluster: service.cluster ?? manifest.defaults?.cluster,
            capabilities: service.capabilities,
            networks: service.networks ?? [],
            ingress: service.ingress,
            logRotation: service.logRotation ?? manifest.defaults?.logRotation,
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
            mountPath: `/var/lib/platform/${manifest.name}/${volumeName}`,
            status: "pending" as const,
            backup: volume.backup,
            createdAt: now,
            updatedAt: now
        }));
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
}
