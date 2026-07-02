import { defineStore } from "pinia";

import { platformClient } from "../api/client.js";
import type { BackupRun, Node, Service } from "@platform/sdk";

/**
 * Cluster dashboard state backed by the control plane API.
 */
export const useClusterStore = defineStore("cluster", {
    state: () => ({
        nodes: [] as Node[],
        services: [] as Service[],
        backups: [] as BackupRun[],
        loading: false,
        error: "" as string
    }),
    actions: {
        /**
         * Loads nodes and services from the control plane.
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
         * Loads backup runs from the control plane.
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
    }
});
