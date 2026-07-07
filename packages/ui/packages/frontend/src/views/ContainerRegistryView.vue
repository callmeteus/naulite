<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useServerPagination } from "../composables/useServerPagination";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();

const {
    items: paginatedImages,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    refresh,
    loading,
    error
} = useServerPagination((page, limit) => nauliteClient.listContainerRegistryImagesPaginated({ page, limit }), 20);

onMounted(() => {
    void refresh();
});

/**
 * Deletes a container registry image by name and tag.
 *
 * @param name Image name
 * @param tag Image tag
 * @returns Nothing.
 */
async function deleteImage(name: string, tag: string): Promise<void> {
    await store.deleteContainerRegistryImage(name, tag);
    await refresh();
}

/**
 * Formats image size in human-readable units.
 *
 * @param sizeBytes Image size in bytes
 * @returns Formatted size label
 */
function formatSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
        return `${sizeBytes} B`;
    }

    if (sizeBytes < 1024 * 1024) {
        return `${(sizeBytes / 1024).toFixed(1)} KiB`;
    }

    return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}
</script>

<template>
    <PageLayout title-key="pages.containerRegistry.title" hint-key="pages.containerRegistry.hint">
        <ErrorAlert :error="store.error || error" />

        <div v-if="loading || store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && !error && paginatedImages.length === 0"
            title-key="pages.containerRegistry.emptyTitle"
            description-key="pages.containerRegistry.emptyDescription"
            action-label-key="pages.containerRegistry.emptyAction"
            action-to="/build"
        />

        <div v-else-if="!store.error && !error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("pages.containerRegistry.imageName") }}</th>
                            <th>{{ t("pages.containerRegistry.imageTag") }}</th>
                            <th>{{ t("pages.containerRegistry.imageDigest") }}</th>
                            <th>{{ t("pages.containerRegistry.imageSize") }}</th>
                            <th>{{ t("pages.containerRegistry.imagePushedAt") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="image in paginatedImages" :key="`${image.name}:${image.tag}`">
                            <td>{{ image.name }}</td>
                            <td>{{ image.tag }}</td>
                            <td><code class="text-xs">{{ image.digest }}</code></td>
                            <td>{{ formatSize(image.sizeBytes) }}</td>
                            <td>{{ image.pushedAt }}</td>
                            <td>
                                <button
                                    v-if="auth.hasPermission('registry:write')"
                                    type="button"
                                    class="btn btn-error btn-outline btn-sm"
                                    :disabled="store.loading"
                                    @click="deleteImage(image.name, image.tag)"
                                >
                                    {{ t("pages.containerRegistry.deleteImage") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-if="paginatedImages.length > 0" class="mt-4 flex items-center justify-end gap-2">
                    <button type="button" class="btn btn-sm" :disabled="!canGoPrevious" @click="previousPage">
                        {{ t("common.paginationPrevious") }}
                    </button>
                    <span class="text-sm">{{ pageLabel }}</span>
                    <button type="button" class="btn btn-sm" :disabled="!canGoNext" @click="nextPage">
                        {{ t("common.paginationNext") }}
                    </button>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
