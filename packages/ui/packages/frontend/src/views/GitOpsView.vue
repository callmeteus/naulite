<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const rollbackId = ref("");
const rollbackMessage = ref("");
const rollbackModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

onMounted(() => {
    void store.refreshGitOpsRevisions();
});

/**
 * Opens the rollback confirmation modal.
 *
 * @returns Nothing.
 */
function requestRollback(): void {
    if (!rollbackId.value) {
        return;
    }

    rollbackModalRef.value?.open();
}

/**
 * Rolls back to the selected revision.
 *
 * @returns Nothing.
 */
async function confirmRollback(): Promise<void> {
    if (!rollbackId.value) {
        return;
    }

    await store.rollbackGitOps(rollbackId.value);
    rollbackMessage.value = t("pages.gitops.rollbackSuccess");
    rollbackId.value = "";
}
</script>

<template>
    <PageLayout title-key="pages.gitops.title" hint-key="pages.gitops.hint">
        <ErrorAlert :error="store.error" />

        <p v-if="rollbackMessage" class="alert alert-success">
            {{ rollbackMessage }}
        </p>

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.gitopsRevisions.length === 0"
            title-key="pages.gitops.emptyTitle"
            description-key="pages.gitops.emptyDescription"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.manifest") }}</th>
                                <th>{{ t("common.tableColumns.branch") }}</th>
                                <th>{{ t("common.tableColumns.commit") }}</th>
                                <th>{{ t("common.tableColumns.appliedAt") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="revision in store.gitopsRevisions" :key="revision.id">
                                <td>{{ revision.id }}</td>
                                <td>{{ revision.manifestName }}</td>
                                <td>{{ revision.branch }}</td>
                                <td><code class="text-xs">{{ revision.commitSha }}</code></td>
                                <td>{{ revision.appliedAt }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="flex flex-wrap items-end gap-3">
                    <label class="form-control w-full max-w-md">
                        <span class="label-text">{{ t("pages.gitops.rollbackPlaceholder") }}</span>
                        <select v-model="rollbackId" class="select select-bordered w-full">
                            <option value="">{{ t("pages.gitops.rollbackPlaceholder") }}</option>
                            <option
                                v-for="revision in store.gitopsRevisions"
                                :key="revision.id"
                                :value="revision.id"
                            >
                                {{ revision.id }} - {{ revision.manifestName }} ({{ revision.commitSha.slice(0, 7) }})
                            </option>
                        </select>
                    </label>
                    <button
                        type="button"
                        class="btn btn-outline btn-error"
                        :disabled="!rollbackId || store.loading"
                        @click="requestRollback"
                    >
                        {{ t("pages.gitops.rollback") }}
                    </button>
                </div>
            </div>
        </div>

        <ConfirmModal
            ref="rollbackModalRef"
            title-key="pages.gitops.rollback"
            message-key="pages.gitops.rollbackConfirm"
            confirm-label-key="pages.gitops.rollback"
            danger
            @confirm="confirmRollback"
        />
    </PageLayout>
</template>
