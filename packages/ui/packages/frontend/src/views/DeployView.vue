<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const manifestYaml = ref(`name: minimal\n\nservices:\n  web:\n    image: nginx:1.27-alpine\n    ports:\n      - "8080:80"\n`);
const revision = ref("");

/**
 * Submits the manifest editor contents to the control plane.
 *
 * @returns Nothing.
 */
async function applyManifest(): Promise<void> {
    revision.value = await store.applyManifest(manifestYaml.value);
}
</script>

<template>
    <PageLayout title-key="pages.deploy.title" hint-key="pages.deploy.hint">
        <ErrorAlert :error="store.error" />

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <textarea
                    v-model="manifestYaml"
                    class="textarea textarea-bordered min-h-64 font-mono text-sm"
                />
                <div class="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="store.loading"
                        @click="applyManifest"
                    >
                        {{ t("pages.deploy.applyManifest") }}
                    </button>
                </div>
                <p v-if="revision">
                    <span class="font-medium">{{ t("pages.deploy.revision") }}:</span>
                    {{ revision }}
                </p>
                <p v-if="store.lastApplyResult?.runId">
                    <router-link
                        class="link link-primary"
                        :to="{ path: '/runs', query: { id: store.lastApplyResult.runId } }"
                    >
                        {{ t("pages.deploy.runLink") }}: {{ store.lastApplyResult.runId }}
                    </router-link>
                </p>
                <div v-if="store.lastApplyResult" class="grid gap-1 text-sm">
                    <p>{{ t("pages.deploy.created") }}: {{ store.lastApplyResult.servicesCreated }}</p>
                    <p>{{ t("pages.deploy.updated") }}: {{ store.lastApplyResult.servicesUpdated }}</p>
                    <p>{{ t("pages.deploy.deleted") }}: {{ store.lastApplyResult.servicesDeleted }}</p>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
