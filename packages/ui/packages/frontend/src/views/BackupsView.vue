<script setup lang="ts">
import { onMounted, ref } from "vue";

import { platformClient } from "../api/Client";
import { useServerPagination } from "../composables/useServerPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const volumeName = ref("");

const {
    items: paginatedBackups,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    refresh,
    loading,
    error
} = useServerPagination((page, limit) => platformClient.listBackupsPaginated({ page, limit }), 20);

onMounted(() => {
    void refresh();
});

/**
 * Triggers a manual backup for the entered volume name.
 *
 * @returns Nothing.
 */
async function runBackup(): Promise<void> {
    const trimmed = volumeName.value.trim();
    if (!trimmed) {
        return;
    }

    await store.runBackup(trimmed);
    volumeName.value = "";
    await refresh();
}

/**
 * Restores a backup run by identifier.
 *
 * @param backupId Backup run identifier
 * @returns Nothing.
 */
async function restoreBackup(backupId: string): Promise<void> {
    await store.restoreBackup(backupId);
    await refresh();
}
</script>

<template>
    <section>
        <h2>{{ t("backups") }}</h2>
        <p v-if="loading || store.loading">{{ t("loading") }}</p>
        <p v-else-if="store.error || error" class="error">{{ store.error || error }}</p>
        <div v-else class="panel">
            <form class="actions" @submit.prevent="runBackup">
                <input
                    v-model="volumeName"
                    type="text"
                    :placeholder="t('backupVolumePlaceholder')"
                />
                <button type="submit" :disabled="store.loading || !volumeName.trim()">
                    {{ t("runBackup") }}
                </button>
            </form>
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Volume</th>
                        <th>Status</th>
                        <th>Destination</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="backup in paginatedBackups" :key="backup.id">
                        <td>{{ backup.id }}</td>
                        <td>{{ backup.volumeName }}</td>
                        <td>{{ backup.status }}</td>
                        <td>{{ backup.destination ?? "-" }}</td>
                        <td>
                            <button
                                type="button"
                                :disabled="store.loading || backup.status === 'running'"
                                @click="restoreBackup(backup.id)"
                            >
                                {{ t("restoreBackup") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="paginatedBackups.length > 0" class="pagination">
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
