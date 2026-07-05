import type { ApplyResponse, BackupRun, ClusterStatus, ContainerRegistryImage, GatewayRouteSummary, Instance, Node, NodeProvision, PipelineEvent, PipelineRun, Secret, Service, Volume } from "@naulite/sdk";
import type { BuildRequest, BuildResponse, ListPipelineRunsQuery, NetBirdAcl, NetBirdDevice, NetBirdGroup, NetBirdTopology, ProvisionNodeInput } from "@naulite/sdk";
import { reactive } from "vue";

import { nauliteClient } from "../api/Client";

interface GitOpsRevision {
    id: string;
    manifestName: string;
    branch: string;
    commitSha: string;
    appliedAt: string;
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
    lastApplyResult: null as ApplyResponse | null,
    loading: false,
    error: "" as string,
    /**
     * Loads nodes and services from the admin API.
     *
     * @returns Nothing.
     */
    async refreshOverview(): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            const [nodes, services] = await Promise.all([
                nauliteClient.listNodes(),
                nauliteClient.listServices()
            ]);
            this.nodes = nodes;
            this.services = services;
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads backup runs from the admin API.
     *
     * @returns Nothing.
     */
    async refreshBackups(): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            this.backups = await nauliteClient.listBackups();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            this.instances = await nauliteClient.listInstances();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Loads volumes from the admin API.
     *
     * @returns Nothing.
     */
    async refreshVolumes(): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            this.volumes = await nauliteClient.listVolumes();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            this.secrets = await nauliteClient.listSecrets();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            this.clusterStatus = await nauliteClient.getClusterStatus();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            const response = await nauliteClient.listGitOpsRevisions();
            this.gitopsRevisions = response.revisions as unknown as GitOpsRevision[];
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            await nauliteClient.rollbackGitOps(revisionId);
            await this.refreshGitOpsRevisions();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

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
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async upsertSecret(name: string, data: Record<string, string>, description?: string): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.upsertSecret({ name, data, description });
            await this.refreshSecrets();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async deleteSecret(name: string): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.deleteSecret(name);
            await this.refreshSecrets();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async runBackup(volumeName: string): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.runBackup(volumeName);
            await this.refreshBackups();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async restoreBackup(backupId: string): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.restoreBackup(backupId);
            await this.refreshBackups();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            this.containerRegistryImages = await nauliteClient.listContainerRegistryImages();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async deleteContainerRegistryImage(name: string, tag: string): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.deleteContainerRegistryImage(name, tag);
            await this.refreshContainerRegistryImages();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
        this.error = "";

        try {
            this.runs = await nauliteClient.listRuns(query);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async triggerBuild(request: BuildRequest): Promise<BuildResponse> {
        this.loading = true;
        this.error = "";

        try {
            return await nauliteClient.triggerBuild(request);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async provisionNode(input: ProvisionNodeInput): Promise<NodeProvision> {
        this.loading = true;
        this.error = "";

        try {
            return await nauliteClient.provisionNode(input);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
     * Loads gateway routes from the admin API.
     *
     * @returns Nothing.
     */
    async refreshGatewayRoutes(): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            this.gatewayRoutes = await nauliteClient.listGatewayRoutes();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
        } finally {
            this.loading = false;
        }
    },

    /**
     * Applies a manifest YAML payload.
     *
     * @param manifestYaml Raw manifest YAML
     * @returns Apply revision summary
     */
    async applyManifest(manifestYaml: string): Promise<string> {
        this.loading = true;
        this.error = "";

        try {
            const result = await nauliteClient.applyManifest(manifestYaml);
            this.lastApplyResult = result;
            await this.refreshOverview();
            return String(result.revision);
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
