import type { BackupRun, ClusterStatus, Instance, Node, Secret, Service, Volume } from "@platform/sdk";
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
            this.gitopsRevisions = response.revisions as GitOpsRevision[];
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
