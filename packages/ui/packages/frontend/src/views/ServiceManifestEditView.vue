<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { Service } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ManifestApplyFields from "../components/manifest/ManifestApplyFields.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useManifestApply } from "../composables/useManifestApply";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { formatServiceDisplayNameFromService } from "../utils/formatServicePresentation";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const service = ref<Service | null>(null);
const loadingService = ref(true);
const loadError = ref<ParsedApiError | null>(null);

const {
    manifestYaml,
    applying,
    loadingManifest,
    applyError,
    loadLatestRevision,
    submitApply
} = useManifestApply();

const serviceName = computed(() => String(route.params.name ?? ""));
const canApply = computed(() => auth.hasPermission("manifests:apply"));
const onlineNodes = computed(() => store.clusterStatus?.summary?.onlineNodes ?? 0);

const showNoNodesBanner = computed(() =>
    Boolean(store.clusterStatus)
    && onlineNodes.value === 0
);

const serviceDisplayName = computed(() => {
    if (service.value) {
        return formatServiceDisplayNameFromService(service.value);
    }

    return serviceName.value || "-";
});

const editorDisabled = computed(() => applying.value || !canApply.value);

/**
 * Loads the service and prefills the manifest editor.
 *
 * @returns Nothing.
 */
async function loadPage(): Promise<void> {
    loadingService.value = true;
    loadError.value = null;

    try {
        const loadedService = await nauliteClient.getService(serviceName.value);
        service.value = loadedService;
        await loadLatestRevision(loadedService.manifestName);
    } catch (err) {
        service.value = null;
        loadError.value = parseApiError(err);
    } finally {
        loadingService.value = false;
    }
}

onMounted(() => {
    if (canApply.value) {
        void store.refreshClusterStatus();
    }

    void loadPage();
});

/**
 * Applies the edited manifest.
 *
 * @returns Nothing.
 */
async function applyManifest(): Promise<void> {
    await submitApply(router);
}
</script>

<template>
    <PageLayout
        title-key="pages.serviceDetail.editManifestTitle"
        :title="serviceDisplayName"
        hint-key="pages.serviceDetail.editManifestHint"
    >
        <template #actions>
            <RouterLink :to="`/services/${serviceName}`" class="btn btn-ghost btn-sm">
                {{ t("pages.serviceDetail.editManifestBack") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="loadError || applyError || store.error" />

        <div v-if="loadingService" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <p v-else-if="!loadError && !service" class="text-base-content/70">
            {{ t("pages.serviceDetail.notFound") }}
        </p>

        <div v-else-if="service" class="mx-auto w-full max-w-4xl">
            <ManifestApplyFields
                v-model="manifestYaml"
                :disabled="editorDisabled"
                :loading="loadingManifest"
                footer-note-key="pages.serviceDetail.editManifestFooterNote"
            >
                <template #intro>
                    <div class="alert border border-info/20 bg-info/10 text-sm">
                        <span>{{ t("pages.serviceDetail.editManifestIntro") }}</span>
                    </div>

                    <ul class="list-disc space-y-1 pl-5 text-sm text-base-content/80">
                        <li>{{ t("pages.deploy.applyConfirmPointDeploy") }}</li>
                        <li>{{ t("pages.deploy.applyConfirmPointOverwrite") }}</li>
                    </ul>

                    <div
                        v-if="showNoNodesBanner"
                        class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
                    >
                        <p class="font-medium">
                            {{ t("pages.runs.quickDeployNoNodesTitle") }}
                        </p>
                        <p class="mt-1 text-base-content/80">
                            {{ t("pages.runs.quickDeployNoNodesDescription") }}
                        </p>
                        <RouterLink to="/nodes" class="link link-primary mt-2 inline-block">
                            {{ t("pages.deploy.actionViewNodes") }}
                        </RouterLink>
                    </div>

                    <div
                        v-if="applying"
                        class="flex items-center gap-2 text-sm text-base-content/70"
                        role="status"
                    >
                        <LoadingSpinner />
                        <span>{{ t("pages.serviceDetail.editManifestApplying") }}</span>
                    </div>
                </template>

                <template #actions>
                    <div class="flex flex-wrap justify-end gap-2">
                        <RouterLink
                            :to="`/services/${serviceName}`"
                            class="btn"
                            :class="{ 'btn-disabled': applying }"
                        >
                            {{ t("common.cancel") }}
                        </RouterLink>
                        <button
                            type="button"
                            class="btn btn-primary"
                            :class="{ loading: applying }"
                            :disabled="applying || !manifestYaml.trim() || !canApply"
                            @click="applyManifest"
                        >
                            {{ t("pages.deploy.applyManifest") }}
                        </button>
                    </div>
                </template>
            </ManifestApplyFields>
        </div>
    </PageLayout>
</template>
