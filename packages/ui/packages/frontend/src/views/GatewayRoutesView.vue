<script setup lang="ts">
import { computed, onMounted } from "vue";

import { useClientPagination } from "../composables/useClientPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

const routesRef = computed(() => store.gatewayRoutes);
const {
    paginatedItems: paginatedRoutes,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage
} = useClientPagination(routesRef, 20);

onMounted(() => {
    void store.refreshGatewayRoutes();
});
</script>

<template>
    <section>
        <h2>{{ t("gatewayRoutes") }}</h2>
        <p class="hint">{{ t("gatewayRoutesHint") }}</p>
        <p v-if="store.loading">{{ t("loading") }}</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>

        <div v-else class="panel">
            <div class="actions">
                <button type="button" :disabled="store.loading" @click="store.refreshGatewayRoutes()">
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

            <p v-if="store.gatewayRoutes.length === 0" class="empty">
                {{ t("gatewayRoutesEmpty") }}
            </p>

            <div v-if="store.gatewayRoutes.length > 0" class="pagination">
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
