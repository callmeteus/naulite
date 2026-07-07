<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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
const volumeName = ref("");
const backupMessage = ref("");

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
} = useServerPagination((page, limit) => nauliteClient.listBackupsPaginated({ page, limit }), 20);

const combinedError = computed(() => store.error || error.value || null);

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

    backupMessage.value = "";
    await store.runBackup(trimmed);
    volumeName.value = "";
    backupMessage.value = t("pages.backups.rerunSuccess");
    await refresh();
}

/**
 * Re-runs a backup for the volume associated with a row.
 *
 * @param backupVolumeName Volume name from the backup row
 * @returns Nothing.
 */
async function rerunBackup(backupVolumeName: string): Promise<void> {
    backupMessage.value = "";
    await store.runBackup(backupVolumeName);
    backupMessage.value = t("pages.backups.rerunSuccess");
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
    <PageLayout title-key="pages.backups.title" hint-key="pages.backups.hint">
        <ErrorAlert :error="combinedError" />

        <p v-if="backupMessage" class="alert alert-success">{{ backupMessage }}</p>

        <div v-if="auth.hasPermission('backups:run')" class="card bg-base-100 shadow">
            <div class="card-body">
                <form class="flex flex-wrap items-end gap-3" @submit.prevent="runBackup">
                    <label class="form-control w-full max-w-md">
                        <span class="label-text">{{ t("pages.backups.volumePlaceholder") }}</span>
                        <input
                            v-model="volumeName"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.backups.volumePlaceholder')"
                        />
                    </label>
                    <button type="submit" class="btn btn-primary" :disabled="store.loading || !volumeName.trim()">
                        {{ t("pages.backups.runBackup") }}
                    </button>
                </form>
            </div>
        </div>

        <div v-if="loading && paginatedBackups.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!combinedError && paginatedBackups.length === 0"
            title-key="pages.backups.emptyTitle"
            description-key="pages.backups.emptyDescription"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.id") }}</th>
                            <th>{{ t("common.tableColumns.volume") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.destination") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="backup in paginatedBackups" :key="backup.id">
                            <td>{{ backup.id }}</td>
                            <td>{{ backup.volumeName }}</td>
                            <td><span class="badge badge-outline">{{ backup.status }}</span></td>
                            <td>{{ backup.destination ?? "-" }}</td>
                            <td class="flex flex-wrap gap-2">
                                <button
                                    v-if="auth.hasPermission('backups:run')"
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    :disabled="store.loading || backup.status === 'running'"
                                    @click="rerunBackup(backup.volumeName)"
                                >
                                    {{ t("pages.backups.rerunBackup") }}
                                </button>
                                <button
                                    v-if="auth.hasPermission('backups:restore')"
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    :disabled="store.loading || backup.status === 'running'"
                                    @click="restoreBackup(backup.id)"
                                >
                                    {{ t("pages.backups.restoreBackup") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-if="paginatedBackups.length > 0" class="mt-4 flex items-center justify-end gap-2">
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
