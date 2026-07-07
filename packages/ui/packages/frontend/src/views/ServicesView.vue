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
    void store.refreshOverview();
});
</script>

<template>
    <PageLayout title-key="pages.services.title" hint-key="pages.services.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.services.length === 0"
            title-key="pages.services.emptyTitle"
            description-key="pages.services.emptyDescription"
            action-label-key="pages.services.emptyAction"
            action-to="/deploy"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.tableColumns.name") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.replicas") }}</th>
                            <th>{{ t("common.tableColumns.lifecycle") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="service in store.services" :key="service.name">
                            <td>{{ service.name }}</td>
                            <td><StatusPill :status="service.status" /></td>
                            <td>{{ service.desiredReplicas }}</td>
                            <td>
                                <StatusPill v-if="service.lifecycleStatus" :status="service.lifecycleStatus" />
                                <span v-else>-</span>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </PageLayout>
</template>
