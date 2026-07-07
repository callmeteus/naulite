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
    <PageLayout title-key="pages.nodes.title" hint-key="pages.nodes.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.nodes.length === 0"
            title-key="pages.nodes.emptyTitle"
            description-key="pages.nodes.emptyDescription"
            action-label-key="pages.nodes.emptyAction"
            action-to="/deploy"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.id") }}</th>
                            <th>{{ t("common.tableColumns.hostname") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("pages.metrics.nodeCpu") }}</th>
                            <th>{{ t("pages.metrics.nodeMemory") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="node in store.nodes" :key="node.id">
                            <td>{{ node.id }}</td>
                            <td>{{ node.hostname }}</td>
                            <td><StatusPill :status="node.status" /></td>
                            <td>{{ node.resources.cpuMillisUsed }}</td>
                            <td>{{ node.resources.memoryMbUsed }} MB</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </PageLayout>
</template>
