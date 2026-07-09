<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useServerPagination } from "../composables/useServerPagination";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
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
    <PageLayout title-key="pages.gatewayRoutes.title" hint-key="pages.gatewayRoutes.hint">
        <template #actions>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="loading"
                @click="refresh"
            >
                {{ t("common.refresh") }}
            </button>
        </template>

        <ErrorAlert :error="store.error || error" />

        <div v-if="loading || store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && !error && paginatedRoutes.length === 0"
            title-key="pages.gatewayRoutes.emptyTitle"
            description-key="pages.gatewayRoutes.emptyDescription"
        />

        <div v-else-if="!store.error && !error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("pages.gatewayRoutes.service") }}</th>
                            <th>{{ t("pages.gatewayRoutes.host") }}</th>
                            <th>{{ t("pages.gatewayRoutes.target") }}</th>
                            <th>{{ t("pages.gatewayRoutes.autoTls") }}</th>
                            <th>{{ t("pages.gatewayRoutes.updatedAt") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="route in paginatedRoutes" :key="route.id">
                            <td>{{ route.serviceName }}</td>
                            <td>{{ route.host }}</td>
                            <td>{{ route.targetHost }}:{{ route.targetPort }}</td>
                            <td>{{ route.autoTls ? t("common.yes") : t("common.no") }}</td>
                            <td>{{ route.updatedAt }}</td>
                        </tr>
                    </tbody>
                </table>

                <div v-if="paginatedRoutes.length > 0" class="mt-4 flex items-center justify-end gap-2">
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
    </PageLayout>
</template>
