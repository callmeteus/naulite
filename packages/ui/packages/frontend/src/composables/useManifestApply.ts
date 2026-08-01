import { ref } from "vue";
import type { Router } from "vue-router";

import { nauliteClient } from "../api/Client";
import { DEFAULT_MANIFEST_YAML } from "../constants/defaultManifest";
import { parseApiError, type ParsedApiError } from "./useApiAction";
import { useClusterStore } from "../stores/Cluster";

type GitOpsRevisionRow = {
    manifestYaml?: string;
    appliedAt?: string;
};

/**
 * Shared state and actions for manifest YAML apply flows.
 *
 * @param initialYaml Starting editor content
 * @returns Manifest apply helpers
 */
export function useManifestApply(initialYaml = DEFAULT_MANIFEST_YAML) {
    const store = useClusterStore();
    const manifestYaml = ref(initialYaml);
    const applying = ref(false);
    const loadingManifest = ref(false);
    const applyError = ref<ParsedApiError | null>(null);

    /**
     * Prefills the editor from the latest applied GitOps revision.
     *
     * @param manifestName Manifest name filter
     * @returns Nothing.
     */
    async function loadLatestRevision(manifestName: string): Promise<void> {
        loadingManifest.value = true;
        applyError.value = null;

        try {
            const response = await nauliteClient.listGitOpsRevisions(manifestName);
            const revisions = response.revisions as GitOpsRevisionRow[];

            if (revisions.length === 0) {
                return;
            }

            const latestRevision = [...revisions].sort((left, right) => {
                const leftTime = Date.parse(left.appliedAt ?? "");
                const rightTime = Date.parse(right.appliedAt ?? "");

                return rightTime - leftTime;
            })[0];

            if (typeof latestRevision?.manifestYaml === "string" && latestRevision.manifestYaml.trim()) {
                manifestYaml.value = latestRevision.manifestYaml;
            }
        } catch (err) {
            applyError.value = parseApiError(err);
        } finally {
            loadingManifest.value = false;
        }
    }

    /**
     * Submits the manifest asynchronously and opens the pipeline run page.
     *
     * @param router Vue router instance
     * @returns Nothing.
     */
    async function submitApply(router: Router): Promise<void> {
        if (!manifestYaml.value.trim() || applying.value) {
            return;
        }

        applying.value = true;
        applyError.value = null;
        store.error = null;

        try {
            const result = await store.applyManifest(manifestYaml.value, { async: true });

            if (result.runId) {
                await router.push(`/runs/${result.runId}`);
                return;
            }

            await router.push("/runs?kind=apply");
        } catch (err) {
            applyError.value = parseApiError(err);
        } finally {
            applying.value = false;
        }
    }

    return {
        manifestYaml,
        applying,
        loadingManifest,
        applyError,
        loadLatestRevision,
        submitApply
    };
}
