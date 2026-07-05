<script setup lang="ts">
import { onMounted } from "vue";

import { nauliteClient } from "../api/Client";
import { useServerPagination } from "../composables/useServerPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

const {
    items: paginatedRoutes,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    refresh,
    loading,
    error
} = useServerPagination((page, limit) => nauliteClient.listGatewayRoutesPaginated({ page, limit }), 20);

onMounted(() => {
    void refresh();
});
</script>

<template>
    <section>
        <h2>{{ t("gatewayRoutes") }}</h2>
        <p class="hint">{{ t("gatewayRoutesHint") }}</p>
        <p v-if="loading || store.loading">{{ t("loading") }}</p>
        <p v-else-if="store.error || error" class="error">{{ store.error || error }}</p>

        <div v-else class="panel">
            <div class="actions">
                <button type="button" :disabled="loading" @click="refresh">
                    {{ t("runsRefresh") }}
                </button>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>{{ t("gatewayService") }}</th>
                        <th>{{ t("gatewayHost") }}</th>
                        <th>{{ t("gatewayTarget") }}</th>
                        <th>{{ t("gatewayAutoTls") }}</th>
                        <th>{{ t("gatewayUpdatedAt") }}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="route in paginatedRoutes" :key="route.id">
                        <td>{{ route.serviceName }}</td>
                        <td>{{ route.host }}</td>
                        <td>{{ route.targetHost }}:{{ route.targetPort }}</td>
                        <td>{{ route.autoTls ? t("yes") : t("no") }}</td>
                        <td>{{ route.updatedAt }}</td>
                    </tr>
                </tbody>
            </table>

            <p v-if="paginatedRoutes.length === 0" class="empty">
                {{ t("gatewayRoutesEmpty") }}
            </p>

            <div v-if="paginatedRoutes.length > 0" class="pagination">
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
