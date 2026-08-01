import { reactive } from "vue";
import type { ApplyResponse, BackupRun, BuildRequest, BuildResponse, ClusterStatus, ContainerRegistryImage, GatewayRouteSummary, HostInventory, HostUpdateRun, Instance, ListPipelineRunsQuery, NetBirdAcl, NetBirdDevice, NetBirdGroup, NetBirdTopology, Node, NodeProvision, PipelineEvent, PipelineRun, ProvisionNodeInput, Secret, Service, Volume } from "@naulite/sdk";
import { NauliteApiError } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { authStore } from "./Auth";

interface GitOpsRevision {
    id: string;
    manifestName: string;
    branch: string;
    commitSha: string;
    appliedAt: string;
}

/**
 * Applies a manifest and retries once after refreshing the CSRF token.
 *
 * @param manifestYaml Raw manifest YAML
 * @returns Apply response from the control plane
 */
async function applyManifestWithCsrfRetry(
    manifestYaml: string,
    options?: { async?: boolean }
): Promise<ApplyResponse> {
    try {
        return await nauliteClient.applyManifest(manifestYaml, options);
    } catch (err) {
        if (err instanceof NauliteApiError && err.status === 403 && err.i18n === "errors.csrfInvalid") {
            await authStore.ensureSession();
            return nauliteClient.applyManifest(manifestYaml, options);
        }

        throw err;
    }
}

/**
 * Cluster dashboard state backed by the admin API.
 */
export const clusterStore = reactive({
    nodes: [] as Node[],
    services: [] as Service[],
    instances: [] as Instance[],
    volumes: [] as Volume[],
    secrets: [] as Secret[],
    backups: [] as BackupRun[],
    clusterStatus: null as ClusterStatus | null,
    gitopsRevisions: [] as GitOpsRevision[],
    netBirdTopology: null as NetBirdTopology | null,
    netBirdDevices: [] as NetBirdDevice[],
    netBirdGroups: [] as NetBirdGroup[],
    netBirdAcls: [] as NetBirdAcl[],
    containerRegistryImages: [] as ContainerRegistryImage[],
    gatewayRoutes: [] as GatewayRouteSummary[],
    runs: [] as PipelineRun[],
    loading: false,
    error: null as ParsedApiError | null,

    /**
     * Stores a parsed API error for display in the UI.
     *
     * @param err Caught error value
     * @returns Nothing.
     */
    setError(err: unknown): void {
        this.error = parseApiError(err);
    },
    /**
     * Loads nodes and services from the admin API.
     *
     * @param options Optional refresh behavior
     * @returns Nothing.
     */
    async refreshOverview(options?: { silent?: boolean }): Promise<void> {
        if (!options?.silent) {
            this.loading = true;
        }

        this.error = null;

        try {
            const [nodes, services] = await Promise.all([
                nauliteClient.listNodes(),
                nauliteClient.listServices()
            ]);

            this.nodes = nodes;
            this.services = services;
        } catch (err) {
            this.setError(err);
        } finally {
            if (!options?.silent) {
                this.loading = false;
            }
        }
    },

    /**
     * Loads backup runs from the admin API.
     *
     * @returns Nothing.
     */
    async refreshBackups(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.backups = await nauliteClient.listBackups();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads instances from the admin API.
     *
     * @returns Nothing.
     */
    async refreshInstances(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.instances = await nauliteClient.listInstances();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Manually re-dispatches a pending or failed instance.
     *
     * @param instanceId Instance identifier
     * @returns Reconcile outcome
     */
    async reconcileInstance(instanceId: string) {
        return nauliteClient.reconcileInstance(instanceId);
    },

    /**
     * Manually re-dispatches pending or failed instances for a service.
     *
     * @param serviceName Service name
     * @returns Per-instance reconcile outcomes
     */
    async reconcileService(serviceName: string) {
        return nauliteClient.reconcileService(serviceName);
    },

    /**
     * Deletes a cluster service by name.
     *
     * @param name Service name
     * @returns Nothing.
     * @throws {unknown}
     */
    async deleteService(name: string): Promise<void> {
        this.error = null;

        try {
            await nauliteClient.deleteService(name);
            await this.refreshOverview({ silent: true });
        } catch (err) {
            this.setError(err);
            throw err;
        }
    },

    /**
     * Loads volumes from the admin API.
     *
     * @returns Nothing.
     */
    async refreshVolumes(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.volumes = await nauliteClient.listVolumes();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads secret metadata from the admin API.
     *
     * @returns Nothing.
     */
    async refreshSecrets(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.secrets = await nauliteClient.listSecrets();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads cluster status from the admin API.
     *
     * @returns Nothing.
     */
    async refreshClusterStatus(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.clusterStatus = await nauliteClient.getClusterStatus();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads GitOps revisions from the admin API.
     *
     * @returns Nothing.
     */
    async refreshGitOpsRevisions(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            const response = await nauliteClient.listGitOpsRevisions();
            this.gitopsRevisions = response.revisions as unknown as GitOpsRevision[];
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Rolls back to a GitOps revision.
     *
     * @param revisionId Revision identifier
     * @returns Nothing.
     */
    async rollbackGitOps(revisionId: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.rollbackGitOps(revisionId);
            await this.refreshGitOpsRevisions();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads NetBird topology and inventory from the admin API.
     *
     * @returns Nothing.
     */
    async refreshNetBird(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            const [topology, devices, groups, acls] = await Promise.all([
                nauliteClient.getNetBirdTopology(),
                nauliteClient.listNetBirdDevices(),
                nauliteClient.listNetBirdGroups(),
                nauliteClient.listNetBirdAcls()
            ]);

            this.netBirdTopology = topology;
            this.netBirdDevices = devices;
            this.netBirdGroups = groups;
            this.netBirdAcls = acls;
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Creates or updates a cluster secret.
     *
     * @param name Secret name
     * @param data Secret key-value pairs
     * @param description Optional description
     * @returns Nothing.
     * @throws {unknown}
     */
    async upsertSecret(name: string, data: Record<string, string>, description?: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.upsertSecret({ name, data, description });
            await this.refreshSecrets();
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Deletes a cluster secret by name.
     *
     * @param name Secret name
     * @returns Nothing.
     * @throws {unknown}
     */
    async deleteSecret(name: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.deleteSecret(name);
            await this.refreshSecrets();
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Triggers a backup run for a volume.
     *
     * @param volumeName Volume name
     * @returns Nothing.
     * @throws {unknown}
     */
    async runBackup(volumeName: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.runBackup(volumeName);
            await this.refreshBackups();
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Restores a backup run by identifier.
     *
     * @param backupId Backup run identifier
     * @returns Nothing.
     * @throws {unknown}
     */
    async restoreBackup(backupId: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.restoreBackup(backupId);
            await this.refreshBackups();
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads container registry images from the admin API.
     *
     * @returns Nothing.
     */
    async refreshContainerRegistryImages(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.containerRegistryImages = await nauliteClient.listContainerRegistryImages();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Deletes a container registry image by name and tag.
     *
     * @param name Image name
     * @param tag Image tag
     * @returns Nothing.
     * @throws {unknown}
     */
    async deleteContainerRegistryImage(name: string, tag: string): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            await nauliteClient.deleteContainerRegistryImage(name, tag);
            await this.refreshContainerRegistryImages();
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads pipeline runs from the admin API.
     *
     * @param query Optional list filters
     * @returns Nothing.
     */
    async refreshRuns(query: ListPipelineRunsQuery = {}): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.runs = await nauliteClient.listRuns(query);
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Returns a pipeline run with steps and events.
     *
     * @param runId Pipeline run identifier
     * @returns Pipeline run detail
     */
    async getRun(runId: string): Promise<PipelineRun> {
        return nauliteClient.getRun(runId);
    },

    /**
     * Returns timeline events for a pipeline run.
     *
     * @param runId Pipeline run identifier
     * @returns Pipeline events
     */
    async getRunEvents(runId: string): Promise<PipelineEvent[]> {
        return nauliteClient.getRunEvents(runId);
    },

    /**
     * Triggers a service image build.
     *
     * @param request Build request payload
     * @returns Build response with optional run identifier
     * @throws {unknown}
     */
    async triggerBuild(request: BuildRequest): Promise<BuildResponse> {
        this.loading = true;
        this.error = null;

        try {
            return await nauliteClient.triggerBuild(request);
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Provisions a cloud node through the control plane.
     *
     * @param input Node provision request payload
     * @returns Created node provision record
     * @throws {unknown}
     */
    async provisionNode(input: ProvisionNodeInput): Promise<NodeProvision> {
        this.loading = true;
        this.error = null;

        try {
            return await nauliteClient.provisionNode(input);
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Returns a node provision request by identifier.
     *
     * @param provisionId Node provision identifier
     * @returns Node provision record
     */
    async getNodeProvision(provisionId: string): Promise<NodeProvision> {
        return nauliteClient.getNodeProvision(provisionId);
    },

    /**
     * Loads host package inventory for a node.
     *
     * @param nodeId Node identifier
     * @param refresh When true, collects a fresh snapshot from the agent
     * @returns Host inventory snapshot
     */
    async getNodeHostInventory(nodeId: string, refresh = false): Promise<HostInventory> {
        this.loading = true;
        this.error = null;

        try {
            return await nauliteClient.getNodeHostInventory(nodeId, { refresh });
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Updates host packages on a node.
     *
     * @param nodeId Node identifier
     * @param packages Optional package names to update
     * @returns Host update run record
     */
    async updateNodePackages(nodeId: string, packages?: string[]): Promise<HostUpdateRun> {
        this.loading = true;
        this.error = null;

        try {
            return await nauliteClient.updateNodePackages(nodeId, packages);
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Performs a full host system update on a node.
     *
     * @param nodeId Node identifier
     * @returns Host update run record
     */
    async updateNodeSystem(nodeId: string): Promise<HostUpdateRun> {
        this.loading = true;
        this.error = null;

        try {
            return await nauliteClient.updateNodeSystem(nodeId);
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Lists historical host update runs for a node.
     *
     * @param nodeId Node identifier
     * @returns Host update runs
     */
    async listNodeHostUpdates(nodeId: string): Promise<HostUpdateRun[]> {
        const response = await nauliteClient.listNodeHostUpdates(nodeId);
        return response.items;
    },

    /**
     * Loads gateway routes from the admin API.
     *
     * @returns Nothing.
     */
    async refreshGatewayRoutes(): Promise<void> {
        this.loading = true;
        this.error = null;

        try {
            this.gatewayRoutes = await nauliteClient.listGatewayRoutes();
        } catch (err) {
            this.setError(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Applies a manifest YAML payload.
     *
     * @param manifestYaml Raw manifest YAML
     * @returns Apply summary including the pipeline run id when available
     * @throws {unknown}
     */
    async applyManifest(manifestYaml: string, options?: { async?: boolean }): Promise<ApplyResponse> {
        this.loading = true;
        this.error = null;

        try {
            if (!authStore.csrfToken) {
                await authStore.ensureSession();
            }

            const result = await applyManifestWithCsrfRetry(manifestYaml, options);
            await this.refreshOverview();
            return result;
        } catch (err) {
            this.setError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    }
});

/**
 * Returns the shared cluster dashboard store.
 *
 * @returns Reactive cluster store
 */
export function useClusterStore() {
    return clusterStore;
}
