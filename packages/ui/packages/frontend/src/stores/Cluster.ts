import type { ApplyResponse, BackupRun, ClusterStatus, ContainerRegistryImage, Instance, Node, Secret, Service, Volume } from "@platform/sdk";
import type { NetBirdAcl, NetBirdDevice, NetBirdGroup, NetBirdTopology } from "@platform/sdk";
import { reactive } from "vue";

import { platformClient } from "../api/Client";

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
                platformClient.listNodes(),
                platformClient.listServices()
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
            this.backups = await platformClient.listBackups();
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
            this.instances = await platformClient.listInstances();
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
            this.volumes = await platformClient.listVolumes();
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
            this.secrets = await platformClient.listSecrets();
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
            this.clusterStatus = await platformClient.getClusterStatus();
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
            const response = await platformClient.listGitOpsRevisions();
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
            await platformClient.rollbackGitOps(revisionId);
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
                platformClient.getNetBirdTopology(),
                platformClient.listNetBirdDevices(),
                platformClient.listNetBirdGroups(),
                platformClient.listNetBirdAcls()
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
            await platformClient.upsertSecret({ name, data, description });
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
            await platformClient.deleteSecret(name);
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
            await platformClient.runBackup(volumeName);
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
            await platformClient.restoreBackup(backupId);
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
            this.containerRegistryImages = await platformClient.listContainerRegistryImages();
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
            await platformClient.deleteContainerRegistryImage(name, tag);
            await this.refreshContainerRegistryImages();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
            throw err;
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
            const result = await platformClient.applyManifest(manifestYaml);
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
