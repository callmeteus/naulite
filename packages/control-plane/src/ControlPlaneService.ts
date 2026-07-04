import type { Instance as InstanceModel, Node, SecretUpsertInput, Service, Volume } from "@platform/shared";

import type { ControlPlaneContext } from "./ControlPlaneContext";
import type { ControlPlaneStore } from "./database/ControlPlaneStore";
import { ClusterStateService } from "./services/ClusterStateService";
import { ControlPlaneSync } from "./services/ControlPlaneSync";
import { GitOpsService } from "./services/GitOpsService";

/**
 * Control plane application service with PascalCase domain namespaces.
 */
export namespace ControlPlaneService {
    let context: ControlPlaneContext | undefined;

    /**
     * Installs the active control plane context for the current process.
     *
     * @param value Control plane context instance
     * @returns Nothing.
     */
    export function install(value: ControlPlaneContext): void {
        context = value;
    }

    /**
     * Returns the installed control plane context.
     *
     * @returns Active control plane context
     */
    export function requireContext(): ControlPlaneContext {
        if (!context) {
            throw new Error("ControlPlaneService is not initialized.");
        }

        return context;
    }

    /**
     * Control plane instance metadata.
     */
    export namespace Instance {
        /**
         * @returns Active control plane instance id
         */
        export function getId(): string {
            return ControlPlaneService.requireContext().instanceId;
        }
    }

    /**
     * Leader election state for HA deployments.
     */
    export namespace Leader {
        /**
         * @returns Whether this instance is the elected leader
         */
        export function isLeader(): boolean {
            return ControlPlaneService.requireContext().leaderElection.isLeader();
        }

        /**
         * @returns Current leader instance id
         */
        export function getLeaderId(): string {
            return ControlPlaneService.requireContext().leaderElection.getLeaderId();
        }

        /**
         * @returns Nothing.
         */
        export function requireLeader(): void {
            ControlPlaneService.requireContext().leaderElection.requireLeader();
        }
    }

    /**
     * Cluster secret management operations.
     */
    export namespace Secrets {
        /**
         * @returns Cluster secret metadata
         */
        export function list(): ReturnType<ControlPlaneContext["secretsService"]["list"]> {
            return ControlPlaneService.requireContext().secretsService.list();
        }

        /**
         * @param name Secret name
         * @returns Secret metadata when found
         */
        export function getByName(name: string): ReturnType<ControlPlaneContext["secretsService"]["getByName"]> {
            return ControlPlaneService.requireContext().secretsService.getByName(name);
        }

        /**
         * @param input Secret upsert payload
         * @returns Stored secret metadata
         */
        export async function upsert(input: SecretUpsertInput) {
            const secret = await ControlPlaneService.requireContext().secretsService.upsert(input);
            await ControlPlaneService.Sync.publish(ControlPlaneSync.EVENTS.SECRET_CHANGED, {
                name: input.name
            });
            return secret;
        }

        /**
         * @param name Secret name
         * @returns Whether a secret was deleted
         */
        export async function deleteByName(name: string) {
            const deleted = await ControlPlaneService.requireContext().secretsService.deleteByName(name);

            if (deleted) {
                await ControlPlaneService.Sync.publish(ControlPlaneSync.EVENTS.SECRET_CHANGED, { name });
            }

            return deleted;
        }
    }

    /**
     * Cluster persistence operations.
     */
    export namespace Store {
        /**
         * Returns the backing store instance.
         *
         * @returns Control plane store
         */
        export function instance(): ControlPlaneStore {
            return backing();
        }

        /**
         * Returns the backing store instance.
         *
         * @returns Control plane store
         */
        function backing(): ControlPlaneStore {
            return ControlPlaneService.requireContext().store;
        }

        /**
         * @returns Cluster nodes
         */
        export function listNodes(): ReturnType<ControlPlaneStore["listNodes"]> {
            return backing().listNodes();
        }

        /**
         * @param id Node identifier
         * @returns Node when found
         */
        export function getNode(id: string): ReturnType<ControlPlaneStore["getNode"]> {
            return backing().getNode(id);
        }

        /**
         * @param hostname Node hostname
         * @returns Node when found
         */
        export function getNodeByHostname(hostname: string): ReturnType<ControlPlaneStore["getNodeByHostname"]> {
            return backing().getNodeByHostname(hostname);
        }

        /**
         * @param node Node payload
         * @returns Nothing.
         */
        export function saveNode(node: Node): ReturnType<ControlPlaneStore["saveNode"]> {
            return backing().saveNode(node);
        }

        /**
         * @param id Node identifier
         * @param input Heartbeat payload
         * @returns Updated node when found
         */
        export function updateNodeHeartbeat(
            id: string,
            input: Parameters<ControlPlaneStore["updateNodeHeartbeat"]>[1]
        ): ReturnType<ControlPlaneStore["updateNodeHeartbeat"]> {
            return backing().updateNodeHeartbeat(id, input);
        }

        /**
         * @returns Cluster services
         */
        export function listServices(): ReturnType<ControlPlaneStore["listServices"]> {
            return backing().listServices();
        }

        /**
         * @returns Cluster instances
         */
        export function listInstances(): ReturnType<ControlPlaneStore["listInstances"]> {
            return backing().listInstances();
        }

        /**
         * @returns Cluster volumes
         */
        export function listVolumes(): ReturnType<ControlPlaneStore["listVolumes"]> {
            return backing().listVolumes();
        }

        /**
         * @returns Cluster secrets
         */
        export function listSecrets(): ReturnType<ControlPlaneStore["listSecrets"]> {
            return backing().listSecrets();
        }

        /**
         * @param name Secret name
         * @returns Secret values when found
         */
        export function getClusterSecretValues(name: string): ReturnType<ControlPlaneStore["getClusterSecretValues"]> {
            return backing().getClusterSecretValues(name);
        }

        /**
         * @param input Secret metadata and values
         * @returns Stored secret metadata
         */
        export function upsertClusterSecret(input: {
            name: string;
            keys: string[];
            value: Record<string, string>;
            description?: string;
        }): ReturnType<ControlPlaneStore["upsertClusterSecret"]> {
            return backing().upsertClusterSecret(input);
        }

        /**
         * @param service Service payload
         * @returns Nothing.
         */
        export function upsertService(service: Service): ReturnType<ControlPlaneStore["upsertService"]> {
            return backing().upsertService(service);
        }

        /**
         * @param instance Instance payload
         * @returns Nothing.
         */
        export function insertInstance(instance: InstanceModel): ReturnType<ControlPlaneStore["insertInstance"]> {
            return backing().insertInstance(instance);
        }

        /**
         * @param volume Volume payload
         * @returns Nothing.
         */
        export function insertVolume(volume: Volume): ReturnType<ControlPlaneStore["insertVolume"]> {
            return backing().insertVolume(volume);
        }

        /**
         * @param instanceId Instance identifier
         * @returns Nothing.
         */
        export function deleteInstance(instanceId: string): ReturnType<ControlPlaneStore["deleteInstance"]> {
            return backing().deleteInstance(instanceId);
        }

        /**
         * @param volumeId Volume identifier
         * @param patch Volume fields to update
         * @returns Nothing.
         */
        export function updateVolume(
            volumeId: string,
            patch: Parameters<ControlPlaneStore["updateVolume"]>[1]
        ): ReturnType<ControlPlaneStore["updateVolume"]> {
            return backing().updateVolume(volumeId, patch);
        }

        /**
         * @param serviceId Service identifier
         * @returns Nothing.
         */
        export function deleteService(serviceId: string): ReturnType<ControlPlaneStore["deleteService"]> {
            return backing().deleteService(serviceId);
        }

        /**
         * @param name Service name
         * @returns Whether a service was deleted
         */
        export function deleteServiceByName(name: string): ReturnType<ControlPlaneStore["deleteServiceByName"]> {
            return backing().deleteServiceByName(name);
        }

        /**
         * @param id Instance identifier
         * @param input Instance update payload
         * @returns Updated instance when found
         */
        export function updateInstance(
            id: string,
            input: Parameters<ControlPlaneStore["updateInstance"]>[1]
        ): ReturnType<ControlPlaneStore["updateInstance"]> {
            return backing().updateInstance(id, input);
        }

        /**
         * @param name Volume name
         * @returns Whether a volume was deleted
         */
        export function deleteVolumeByName(name: string): ReturnType<ControlPlaneStore["deleteVolumeByName"]> {
            return backing().deleteVolumeByName(name);
        }

        /**
         * @param name Secret name
         * @returns Whether a secret was deleted
         */
        export function deleteSecretByName(name: string): ReturnType<ControlPlaneStore["deleteSecretByName"]> {
            return backing().deleteSecretByName(name);
        }

        /**
         * @param volumeName Volume name
         * @returns Enqueued backup run
         */
        export function enqueueBackupRun(volumeName: string): ReturnType<ControlPlaneStore["enqueueBackupRun"]> {
            return backing().enqueueBackupRun(volumeName);
        }

        /**
         * @param pagination Pagination query parameters
         * @returns Paginated backup runs
         */
        export function listBackupRuns(
            pagination?: Parameters<ControlPlaneStore["listBackupRuns"]>[0]
        ): ReturnType<ControlPlaneStore["listBackupRuns"]> {
            return backing().listBackupRuns(pagination);
        }

        /**
         * @param id Backup run identifier
         * @returns Backup run when found
         */
        export function getBackupRun(id: string): ReturnType<ControlPlaneStore["getBackupRun"]> {
            return backing().getBackupRun(id);
        }

        /**
         * @returns API keys
         */
        export function listApiKeys(): ReturnType<ControlPlaneStore["listApiKeys"]> {
            return backing().listApiKeys();
        }

        /**
         * @param name API key label
         * @returns Created API key
         */
        export function createApiKey(name: string): ReturnType<ControlPlaneStore["createApiKey"]> {
            return backing().createApiKey(name);
        }

        /**
         * @param apiKeyId API key identifier
         * @returns Whether the key was revoked
         */
        export function revokeApiKey(apiKeyId: string): ReturnType<ControlPlaneStore["revokeApiKey"]> {
            return backing().revokeApiKey(apiKeyId);
        }

        /**
         * @param apiKeyId API key identifier
         * @returns Rotated API key when found
         */
        export function rotateApiKey(apiKeyId: string): ReturnType<ControlPlaneStore["rotateApiKey"]> {
            return backing().rotateApiKey(apiKeyId);
        }

        /**
         * @param secret API key secret
         * @returns Whether the key is valid
         */
        export function validateApiKey(secret: string): ReturnType<ControlPlaneStore["validateApiKey"]> {
            return backing().validateApiKey(secret);
        }
    }

    /**
     * Database health and connectivity.
     */
    export namespace Database {
        /**
         * @returns Whether the database is healthy
         */
        export function healthCheck(): ReturnType<ControlPlaneContext["databaseProvider"]["healthCheck"]> {
            return ControlPlaneService.requireContext().databaseProvider.healthCheck();
        }

        /**
         * @returns Whether pending SQL migrations remain unapplied
         */
        export function hasPendingMigrations(): ReturnType<ControlPlaneContext["databaseProvider"]["hasPendingMigrations"]> {
            return ControlPlaneService.requireContext().databaseProvider.hasPendingMigrations();
        }
    }

    /**
     * Git revision tracking and repository checkout.
     */
    export namespace GitOps {
        /**
         * Checks out a repository and merges overlay manifests.
         *
         * @param input Checkout request
         * @returns Merged manifest YAML and commit metadata
         */
        export function checkoutAndMerge(
            ...args: Parameters<typeof GitOpsService.checkoutAndMerge>
        ): ReturnType<typeof GitOpsService.checkoutAndMerge> {
            return GitOpsService.checkoutAndMerge(...args);
        }

        /**
         * Records an applied Git revision in cluster state.
         *
         * @param input Revision metadata
         * @param manifestYaml Manifest body
         * @param manifest Parsed manifest
         * @param rolledBackFromId Optional rollback source revision id
         * @param runId Optional pipeline run to link to the revision
         * @returns Stored revision summary
         */
        export function recordRevision(
            ...args: Parameters<typeof GitOpsService.recordRevision>
        ): ReturnType<typeof GitOpsService.recordRevision> {
            return GitOpsService.recordRevision(...args);
        }

        /**
         * Creates a GitOps apply pipeline run for webhook-triggered applies.
         *
         * @param input Git metadata for the apply run
         * @returns Persisted pipeline run
         */
        export function createApplyRun(
            ...args: Parameters<typeof GitOpsService.createApplyRun>
        ): ReturnType<typeof GitOpsService.createApplyRun> {
            return GitOpsService.createApplyRun(...args);
        }

        /**
         * Lists stored GitOps revisions.
         *
         * @returns Revision metadata list
         */
        export function listRevisions(
            ...args: Parameters<typeof GitOpsService.listRevisions>
        ): ReturnType<typeof GitOpsService.listRevisions> {
            return GitOpsService.listRevisions(...args);
        }

        /**
         * Loads a single GitOps revision by id.
         *
         * @param revisionId Revision identifier
         * @returns Revision metadata when found
         */
        export function getRevision(
            ...args: Parameters<typeof GitOpsService.getRevision>
        ): ReturnType<typeof GitOpsService.getRevision> {
            return GitOpsService.getRevision(...args);
        }

        /**
         * Rolls the cluster back to a previous GitOps revision.
         *
         * @param revisionId Revision identifier
         * @returns Apply result from the rollback manifest
         */
        export function rollback(
            ...args: Parameters<typeof GitOpsService.rollback>
        ): ReturnType<typeof GitOpsService.rollback> {
            return GitOpsService.rollback(...args);
        }

        /**
         * Configures the GitOps working directory.
         *
         * @param options GitOps service options
         * @returns Nothing.
         */
        export function configure(
            ...args: Parameters<typeof GitOpsService.configure>
        ): ReturnType<typeof GitOpsService.configure> {
            return GitOpsService.configure(...args);
        }
    }

    /**
     * NetBird mesh operations.
     */
    export namespace NetBird {
        /**
         * @returns NetBird groups
         */
        export function listGroups(): ReturnType<ControlPlaneContext["netBirdService"]["listGroups"]> {
            return ControlPlaneService.requireContext().netBirdService.listGroups();
        }

        /**
         * @returns NetBird devices
         */
        export function listDevices(): ReturnType<ControlPlaneContext["netBirdService"]["listDevices"]> {
            return ControlPlaneService.requireContext().netBirdService.listDevices();
        }

        /**
         * @returns NetBird ACLs
         */
        export function listAcls(): ReturnType<ControlPlaneContext["netBirdService"]["listAcls"]> {
            return ControlPlaneService.requireContext().netBirdService.listAcls();
        }

        /**
         * @returns NetBird topology
         */
        export function getTopology(): ReturnType<ControlPlaneContext["netBirdService"]["getTopology"]> {
            return ControlPlaneService.requireContext().netBirdService.getTopology();
        }

        /**
         * @param name Group name
         * @returns Ensured NetBird group
         */
        export function ensureInternalGroup(name: string): ReturnType<ControlPlaneContext["netBirdService"]["ensureInternalGroup"]> {
            return ControlPlaneService.requireContext().netBirdService.ensureInternalGroup(name);
        }

        /**
         * @param groupId NetBird group identifier
         * @param policyName Stable policy name
         * @param ports Optional destination ports
         * @returns Ensured ACL metadata
         */
        export function ensureGroupAccessPolicy(
            groupId: string,
            policyName: string,
            ports: string[] = []
        ): ReturnType<ControlPlaneContext["netBirdService"]["ensureGroupAccessPolicy"]> {
            return ControlPlaneService.requireContext().netBirdService.ensureGroupAccessPolicy(groupId, policyName, ports);
        }

        /**
         * @param peerIds NetBird peer identifiers from registered nodes
         * @returns Updated platform nodes group
         */
        export function syncPlatformNodePeers(
            peerIds: string[]
        ): ReturnType<ControlPlaneContext["netBirdService"]["syncPlatformNodePeers"]> {
            return ControlPlaneService.requireContext().netBirdService.syncPlatformNodePeers(peerIds);
        }
    }

    /**
     * Ingress gateway operations.
     */
    export namespace Gateway {
        /**
         * @param route Gateway route definition
         * @returns Nothing.
         */
        export function upsertRoute(
            route: Parameters<ControlPlaneContext["gatewayRouteService"]["upsertRoute"]>[0]
        ): ReturnType<ControlPlaneContext["gatewayRouteService"]["upsertRoute"]> {
            return ControlPlaneService.requireContext().gatewayRouteService.upsertRoute(route);
        }

        /**
         * @param serviceName Service name associated with the route
         * @param host Ingress host name
         * @returns Whether a route was removed
         */
        export function removeRoute(
            serviceName: string,
            host: string
        ): ReturnType<ControlPlaneContext["gatewayRouteService"]["removeRoute"]> {
            return ControlPlaneService.requireContext().gatewayRouteService.removeRoute(serviceName, host);
        }

        /**
         * @param pagination Pagination query parameters
         * @returns Paginated persisted gateway routes
         */
        export function listRoutes(
            pagination?: Parameters<ControlPlaneContext["gatewayRouteService"]["listRoutes"]>[0]
        ): ReturnType<ControlPlaneContext["gatewayRouteService"]["listRoutes"]> {
            return ControlPlaneService.requireContext().gatewayRouteService.listRoutes(pagination);
        }

        /**
         * @param host Host name to secure
         * @returns Nothing.
         */
        export function requestAutoTls(host: string): ReturnType<ControlPlaneContext["gatewayRouteService"]["requestAutoTls"]> {
            return ControlPlaneService.requireContext().gatewayRouteService.requestAutoTls(host);
        }
    }

    /**
     * Agent bootstrap enrollment.
     */
    export namespace Enrollment {
        /**
         * @returns NetBird setup key for agent enrollment
         */
        export function ensureSetupKey(): ReturnType<ControlPlaneContext["netBirdEnrollment"]["ensureSetupKey"]> {
            return ControlPlaneService.requireContext().netBirdEnrollment.ensureSetupKey();
        }
    }

    /**
     * Cloud node provisioning operations.
     */
    export namespace NodeProvision {
        /**
         * @param input Provision request payload
         * @returns Created node provision record
         */
        export function provision(
            input: Parameters<ControlPlaneContext["nodeProvisionService"]["provision"]>[0]
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["provision"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.provision(input);
        }

        /**
         * @param pagination Pagination query parameters
         * @returns Paginated node provision records
         */
        export function listProvisions(
            pagination?: Parameters<ControlPlaneContext["nodeProvisionService"]["listProvisions"]>[0]
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["listProvisions"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.listProvisions(pagination);
        }

        /**
         * @param id Provision identifier
         * @returns Node provision record
         */
        export function getProvision(
            id: string
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["getProvision"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.getProvision(id);
        }

        /**
         * @param id Provision identifier
         * @returns Updated node provision record
         */
        export function terminateProvision(
            id: string
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["terminateProvision"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.terminateProvision(id);
        }

        /**
         * @param provisionId Provision identifier
         * @param nodeId Registered node identifier
         * @returns Updated node provision when found
         */
        export function completeRegistration(
            provisionId: string,
            nodeId: string
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["completeRegistration"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.completeRegistration(provisionId, nodeId);
        }

        /**
         * @param provisionId Provision identifier
         * @param setupKey Setup key presented by the agent
         * @returns Whether the setup key is valid for the provision
         */
        export function validateProvisionSetupKey(
            provisionId: string,
            setupKey: string
        ): ReturnType<ControlPlaneContext["nodeProvisionService"]["validateProvisionSetupKey"]> {
            return ControlPlaneService.requireContext().nodeProvisionService.validateProvisionSetupKey(
                provisionId,
                setupKey
            );
        }
    }

    /**
     * Control plane cluster synchronization events.
     */
    export namespace Sync {
        /**
         * @param event Event name
         * @param payload Event payload
         * @returns Published event when stored
         */
        export function publish(
            event: Parameters<ControlPlaneContext["controlPlaneSync"]["publish"]>[0],
            payload: Parameters<ControlPlaneContext["controlPlaneSync"]["publish"]>[1]
        ): ReturnType<ControlPlaneContext["controlPlaneSync"]["publish"]> {
            return ControlPlaneService.requireContext().controlPlaneSync.publish(event, payload);
        }

        /**
         * @param eventType Event type identifier
         * @param listener Event listener callback
         * @returns Nothing.
         */
        export function subscribe(
            eventType: string,
            listener: Parameters<ControlPlaneContext["controlPlaneSync"]["subscribe"]>[1]
        ): void {
            ControlPlaneService.requireContext().controlPlaneSync.subscribe(eventType, listener);
        }
    }

    /**
     * Manifest apply revision counter.
     */
    export namespace Apply {
        /**
         * @returns Current apply revision
         */
        export function getRevision(): number {
            return ControlPlaneService.requireContext().applyRevision;
        }

        /**
         * Increments the apply revision counter.
         *
         * @returns Updated revision number
         */
        export async function incrementRevision(): Promise<number> {
            const active = ControlPlaneService.requireContext();
            active.applyRevision += 1;
            await ClusterStateService.saveApplyRevision(active.applyRevision);
            await ControlPlaneService.Sync.publish(ControlPlaneSync.EVENTS.APPLY_REVISION_CHANGED, {
                revision: active.applyRevision
            });
            return active.applyRevision;
        }
    }

    /**
     * Private container registry blob storage.
     */
    export namespace ContainerRegistry {
        /**
         * @param pagination Pagination query parameters
         * @returns Paginated stored container images
         */
        export function listImages(
            pagination?: Parameters<ControlPlaneContext["containerRegistryService"]["listImages"]>[0]
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["listImages"]> {
            return ControlPlaneService.requireContext().containerRegistryService.listImages(pagination);
        }

        /**
         * @param name Image name
         * @param tag Image tag
         * @returns Image metadata when present
         */
        export function getImage(
            name: string,
            tag: string
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["getImage"]> {
            return ControlPlaneService.requireContext().containerRegistryService.getImage(name, tag);
        }

        /**
         * @param name Image name
         * @param tag Image tag
         * @returns Blob metadata when present
         */
        export function headImage(
            name: string,
            tag: string
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["headImage"]> {
            return ControlPlaneService.requireContext().containerRegistryService.headImage(name, tag);
        }

        /**
         * @param name Image name
         * @param tag Image tag
         * @returns Image metadata and readable blob stream
         */
        export function getImageStream(
            name: string,
            tag: string
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["getImageStream"]> {
            return ControlPlaneService.requireContext().containerRegistryService.getImageStream(name, tag);
        }

        /**
         * @param name Image name
         * @param tag Image tag
         * @param body Incoming request body stream
         * @returns Persisted image metadata
         */
        export function putImage(
            name: string,
            tag: string,
            body: Parameters<ControlPlaneContext["containerRegistryService"]["putImage"]>[2]
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["putImage"]> {
            return ControlPlaneService.requireContext().containerRegistryService.putImage(name, tag, body);
        }

        /**
         * @param name Image name
         * @param tag Image tag
         * @returns Whether an image was deleted
         */
        export function deleteImage(
            name: string,
            tag: string
        ): ReturnType<ControlPlaneContext["containerRegistryService"]["deleteImage"]> {
            return ControlPlaneService.requireContext().containerRegistryService.deleteImage(name, tag);
        }
    }

    /**
     * Manifest orchestration helpers.
     */
    export namespace Orchestration {
        /**
         * Compose manifest parsing.
         */
        export namespace ComposeParser {
            /**
             * @param manifestYaml Manifest YAML document
             * @returns Parsed manifest
             */
            export function parse(manifestYaml: string) {
                return ControlPlaneService.requireContext().composeParser.parse(manifestYaml);
            }

            /**
             * @param manifest Parsed manifest
             * @returns Internal exposure definitions
             */
            export function extractInternalExposures(manifest: Parameters<ControlPlaneContext["composeParser"]["extractInternalExposures"]>[0]) {
                return ControlPlaneService.requireContext().composeParser.extractInternalExposures(manifest);
            }
        }

        /**
         * Cluster planner operations.
         */
        export namespace Planner {
            /**
             * @param manifest Desired manifest
             * @param actual Current cluster state
             * @returns Planner diff
             */
            export function diff(
                manifest: Parameters<ControlPlaneContext["planner"]["diff"]>[0],
                actual: Parameters<ControlPlaneContext["planner"]["diff"]>[1]
            ) {
                return ControlPlaneService.requireContext().planner.diff(manifest, actual);
            }

            /**
             * @param manifestName Manifest name
             * @param nodeId Target node id
             * @param revision Apply revision
             * @param operations Execution operations
             * @returns Execution plan
             */
            export function buildExecutionPlan(
                manifestName: Parameters<ControlPlaneContext["planner"]["buildExecutionPlan"]>[0],
                nodeId: Parameters<ControlPlaneContext["planner"]["buildExecutionPlan"]>[1],
                revision: Parameters<ControlPlaneContext["planner"]["buildExecutionPlan"]>[2],
                operations: Parameters<ControlPlaneContext["planner"]["buildExecutionPlan"]>[3]
            ) {
                return ControlPlaneService.requireContext().planner.buildExecutionPlan(
                    manifestName,
                    nodeId,
                    revision,
                    operations
                );
            }
        }

        /**
         * Workload scheduling.
         */
        export namespace Scheduler {
            /**
             * @param service Service record
             * @param manifestService Manifest service definition
             * @param nodes Cluster nodes
             * @returns Schedule result
             */
            export function schedule(
                service: Parameters<ControlPlaneContext["scheduler"]["schedule"]>[0],
                manifestService: Parameters<ControlPlaneContext["scheduler"]["schedule"]>[1],
                nodes: Parameters<ControlPlaneContext["scheduler"]["schedule"]>[2]
            ) {
                return ControlPlaneService.requireContext().scheduler.schedule(service, manifestService, nodes);
            }
        }

        /**
         * Internal exposure planning.
         */
        export namespace Exposure {
            /**
             * @param manifest Parsed manifest
             * @param exposures Internal exposures
             * @returns Exposure plan
             */
            export function plan(
                manifest: Parameters<ControlPlaneContext["exposurePlanner"]["plan"]>[0],
                exposures: Parameters<ControlPlaneContext["exposurePlanner"]["plan"]>[1]
            ) {
                return ControlPlaneService.requireContext().exposurePlanner.plan(manifest, exposures);
            }
        }
    }
}
