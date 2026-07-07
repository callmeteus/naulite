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
    void store.refreshClusterStatus();
});
</script>

<template>
    <PageLayout title-key="pages.cluster.title" hint-key="pages.cluster.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && !store.clusterStatus"
            title-key="pages.cluster.emptyTitle"
            description-key="pages.cluster.emptyDescription"
        />

        <div v-else-if="!store.error && store.clusterStatus" class="card bg-base-100 shadow">
            <div class="card-body gap-2">
                <p>
                    <span class="font-medium">{{ t("common.status") }}:</span>
                    <StatusPill class="ml-2" :status="store.clusterStatus.health.status" size="md" />
                </p>
                <p>
                    <span class="font-medium">{{ t("menu.infrastructure.nodes") }}:</span>
                    {{ store.clusterStatus.summary?.nodes ?? store.clusterStatus.health.nodeCount }}
                </p>
                <p>
                    <span class="font-medium">{{ t("menu.workloads.services") }}:</span>
                    {{ store.clusterStatus.summary?.services ?? store.clusterStatus.health.serviceCount }}
                </p>
                <p>
                    <span class="font-medium">{{ t("pages.deploy.revision") }}:</span>
                    {{ store.clusterStatus.revision ?? "-" }}
                </p>
            </div>
        </div>
    </PageLayout>
</template>
