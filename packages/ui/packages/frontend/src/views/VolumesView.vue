<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();

onMounted(() => {
    void store.refreshVolumes();
});
</script>

<template>
    <PageLayout title-key="pages.volumes.title" hint-key="pages.volumes.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.volumes.length === 0"
            title-key="pages.volumes.emptyTitle"
            description-key="pages.volumes.emptyDescription"
            action-label-key="pages.volumes.emptyAction"
            action-to="/deploy"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.tableColumns.name") }}</th>
                            <th>{{ t("common.tableColumns.manifest") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.mountPath") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="volume in store.volumes" :key="volume.id">
                            <td>{{ volume.name }}</td>
                            <td>{{ volume.manifestName }}</td>
                            <td><StatusPill :status="volume.status" /></td>
                            <td>{{ volume.mountPath }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </PageLayout>
</template>
