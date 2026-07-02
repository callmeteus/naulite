import type { Instance, Node, Service, Volume } from "@platform/shared";

import type { ControlPlaneContext } from "./ControlPlaneContext";
import type { ControlPlaneStore } from "./database/ControlPlaneStore";
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
        export function insertInstance(instance: Instance): ReturnType<ControlPlaneStore["insertInstance"]> {
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
         * @returns Backup runs
         */
        export function listBackupRuns(): ReturnType<ControlPlaneStore["listBackupRuns"]> {
            return backing().listBackupRuns();
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
    }

    /**
     * Git revision tracking and repository checkout.
     */
    export namespace GitOps {
        export const checkoutAndMerge = GitOpsService.checkoutAndMerge;
        export const recordRevision = GitOpsService.recordRevision;
        export const listRevisions = GitOpsService.listRevisions;
        export const getRevision = GitOpsService.getRevision;
        export const rollback = GitOpsService.rollback;
        export const configure = GitOpsService.configure;
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
     * Control plane cluster synchronization events.
     */
    export namespace Sync {
        /**
         * @param event Event name
         * @param payload Event payload
         * @returns Nothing.
         */
        export function publish(
            event: Parameters<ControlPlaneContext["controlPlaneSync"]["publish"]>[0],
            payload: Parameters<ControlPlaneContext["controlPlaneSync"]["publish"]>[1]
        ): ReturnType<ControlPlaneContext["controlPlaneSync"]["publish"]> {
            return ControlPlaneService.requireContext().controlPlaneSync.publish(event, payload);
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
        export function incrementRevision(): number {
            const active = ControlPlaneService.requireContext();
            active.applyRevision += 1;
            return active.applyRevision;
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
