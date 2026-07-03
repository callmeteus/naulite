<script setup lang="ts">
import { computed, onMounted } from "vue";

import { useClientPagination } from "../composables/useClientPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

const imagesRef = computed(() => store.containerRegistryImages);
const {
    paginatedItems: paginatedImages,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage
} = useClientPagination(imagesRef, 20);

onMounted(() => {
    void store.refreshContainerRegistryImages();
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
    <section>
        <h2>{{ t("containerRegistry") }}</h2>
        <p class="hint">{{ t("containerRegistryHint") }}</p>
        <p v-if="store.loading">{{ t("loading") }}</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>{{ t("imageName") }}</th>
                        <th>{{ t("imageTag") }}</th>
                        <th>{{ t("imageDigest") }}</th>
                        <th>{{ t("imageSize") }}</th>
                        <th>{{ t("imagePushedAt") }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="image in paginatedImages" :key="`${image.name}:${image.tag}`">
                        <td>{{ image.name }}</td>
                        <td>{{ image.tag }}</td>
                        <td><code>{{ image.digest }}</code></td>
                        <td>{{ formatSize(image.sizeBytes) }}</td>
                        <td>{{ image.pushedAt }}</td>
                        <td>
                            <button
                                type="button"
                                :disabled="store.loading"
                                @click="deleteImage(image.name, image.tag)"
                            >
                                {{ t("deleteImage") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p v-if="store.containerRegistryImages.length === 0" class="empty">
                {{ t("containerRegistryEmpty") }}
            </p>
            <div v-if="store.containerRegistryImages.length > 0" class="pagination">
                <button type="button" :disabled="!canGoPrevious" @click="previousPage">
                    {{ t("paginationPrevious") }}
                </button>
                <span>{{ pageLabel }}</span>
                <button type="button" :disabled="!canGoNext" @click="nextPage">
                    {{ t("paginationNext") }}
                </button>
            </div>
        </div>
    </section>
</template>
