import type { BackupRun, Node, Service } from "@platform/sdk";
import { reactive } from "vue";

import { platformClient } from "../api/Client";

/**
 * Cluster dashboard state backed by the admin API.
 */
export const clusterStore = reactive({
    nodes: [] as Node[],
    services: [] as Service[],
    backups: [] as BackupRun[],
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
            return result.revision;
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
