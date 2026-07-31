<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import type { Volume } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useServerPagination } from "../composables/useServerPagination";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();

const backupMessage = ref("");
const selectedVolumeName = ref("");
const runningBackup = ref(false);
const volumesLoading = ref(false);
const runBackupDialogRef = ref<HTMLDialogElement | null>(null);

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
const canRunBackup = computed(() => auth.hasPermission("backups:run"));

const sortedVolumes = computed(() => {
    return [...store.volumes].sort((left, right) => {
        const leftHasPolicy = Boolean(left.backup);
        const rightHasPolicy = Boolean(right.backup);

        if (leftHasPolicy !== rightHasPolicy) {
            return leftHasPolicy ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
    });
});

const selectedVolume = computed(() =>
    sortedVolumes.value.find((volume) => volume.name === selectedVolumeName.value)
);

onMounted(() => {
    void refreshAll();
});

/**
 * Reloads backup history and cluster volumes.
 *
 * @returns Nothing.
 */
async function refreshAll(): Promise<void> {
    volumesLoading.value = true;

    try {
        await Promise.all([
            refresh(),
            store.refreshVolumes()
        ]);
    } finally {
        volumesLoading.value = false;
    }
}

/**
 * Opens the run-backup dialog.
 *
 * @returns Nothing.
 */
function openRunBackupModal(): void {
    selectedVolumeName.value = "";
    runBackupDialogRef.value?.showModal();
}

/**
 * Closes the run-backup dialog.
 *
 * @returns Nothing.
 */
function closeRunBackupModal(): void {
    runBackupDialogRef.value?.close();
}

/**
 * Formats a volume option label for the picker.
 *
 * @param volume Cluster volume
 * @returns Display label
 */
function formatVolumeOption(volume: Volume): string {
    const suffix = volume.backup
        ? t("pages.backups.volumeOptionScheduled")
        : t("pages.backups.volumeOptionNoPolicy");

    return `${volume.name} · ${volume.manifestName} (${suffix})`;
}

/**
 * Triggers a manual backup for the selected volume.
 *
 * @returns Nothing.
 */
async function confirmRunBackup(): Promise<void> {
    if (!selectedVolumeName.value || runningBackup.value) {
        return;
    }

    runningBackup.value = true;
    backupMessage.value = "";

    try {
        await store.runBackup(selectedVolumeName.value);
        backupMessage.value = t("pages.backups.rerunSuccess");
        closeRunBackupModal();
        await refresh();
    } finally {
        runningBackup.value = false;
    }
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
        <template #actions>
            <button
                type="button"
                class="btn btn-ghost btn-sm"
                :class="{ loading: loading || volumesLoading || store.loading }"
                :disabled="loading || volumesLoading || store.loading"
                @click="refreshAll"
            >
                {{ t("pages.backups.refresh") }}
            </button>
            <button
                v-if="canRunBackup"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openRunBackupModal"
            >
                {{ t("pages.backups.runBackup") }}
            </button>
        </template>

        <ErrorAlert :error="combinedError" />

        <p v-if="backupMessage" class="alert alert-success">
            {{ backupMessage }}
        </p>

        <div v-if="loading && paginatedBackups.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!combinedError && paginatedBackups.length === 0"
            title-key="pages.backups.emptyTitle"
            description-key="pages.backups.emptyDescription"
            :action-label-key="canRunBackup ? 'pages.backups.runBackup' : undefined"
            @action="openRunBackupModal"
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
                            <td><StatusPill :status="backup.status" /></td>
                            <td>{{ backup.destination ?? "-" }}</td>
                            <td class="flex flex-wrap gap-2">
                                <button
                                    v-if="canRunBackup"
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
                    <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="!canGoPrevious"
                        @click="previousPage"
                    >
                        {{ t("common.paginationPrevious") }}
                    </button>
                    <span class="text-sm">{{ pageLabel }}</span>
                    <button
                        type="button"
                        class="btn btn-sm"
                        :disabled="!canGoNext"
                        @click="nextPage"
                    >
                        {{ t("common.paginationNext") }}
                    </button>
                </div>
            </div>
        </div>

        <dialog ref="runBackupDialogRef" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="text-lg font-bold">
                    {{ t("pages.backups.runBackupTitle") }}
                </h3>
                <p class="py-2 text-sm text-base-content/70">
                    {{ t("pages.backups.runBackupDescription") }}
                </p>

                <div v-if="volumesLoading" class="flex items-center gap-2 py-4">
                    <LoadingSpinner />
                    <span>{{ t("common.loading") }}</span>
                </div>

                <div v-else-if="sortedVolumes.length === 0" class="space-y-3 py-2">
                    <p class="text-sm text-base-content/70">
                        {{ t("pages.backups.noVolumesDescription") }}
                    </p>
                    <RouterLink to="/volumes" class="btn btn-outline btn-sm" @click="closeRunBackupModal">
                        {{ t("pages.backups.viewVolumes") }}
                    </RouterLink>
                </div>

                <div v-else class="space-y-3">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.backups.volumeLabel") }}</span>
                        <select
                            v-model="selectedVolumeName"
                            class="select select-bordered w-full"
                        >
                            <option disabled value="">
                                {{ t("pages.backups.volumeSelectPlaceholder") }}
                            </option>
                            <option
                                v-for="volume in sortedVolumes"
                                :key="volume.id"
                                :value="volume.name"
                            >
                                {{ formatVolumeOption(volume) }}
                            </option>
                        </select>
                    </label>

                    <div
                        v-if="selectedVolume"
                        class="rounded-box bg-base-200/60 p-3 text-sm"
                    >
                        <p>
                            <span class="font-medium">{{ t("common.tableColumns.manifest") }}:</span>
                            {{ selectedVolume.manifestName }}
                        </p>
                        <p>
                            <span class="font-medium">{{ t("common.tableColumns.mountPath") }}:</span>
                            {{ selectedVolume.mountPath }}
                        </p>
                        <p class="flex flex-wrap items-center gap-2">
                            <span class="font-medium">{{ t("common.status") }}:</span>
                            <StatusPill :status="selectedVolume.status" />
                        </p>
                        <p v-if="selectedVolume.backup?.schedule">
                            <span class="font-medium">{{ t("pages.backups.backupSchedule") }}:</span>
                            <code class="text-xs">{{ selectedVolume.backup.schedule }}</code>
                        </p>
                        <p v-else class="text-warning">
                            {{ t("pages.backups.volumeNoPolicy") }}
                        </p>
                    </div>
                </div>

                <div class="modal-action">
                    <button
                        type="button"
                        class="btn"
                        :disabled="runningBackup"
                        @click="closeRunBackupModal"
                    >
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="!selectedVolumeName || runningBackup || sortedVolumes.length === 0"
                        @click="confirmRunBackup"
                    >
                        <span v-if="runningBackup" class="loading loading-spinner loading-sm" />
                        {{
                            runningBackup
                                ? t("common.working")
                                : t("pages.backups.runBackup")
                        }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="button" @click="closeRunBackupModal">
                    close
                </button>
            </form>
        </dialog>
    </PageLayout>
</template>
