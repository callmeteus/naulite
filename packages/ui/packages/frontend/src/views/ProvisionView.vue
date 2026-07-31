<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useServerPagination } from "../composables/useServerPagination";
import {
    NodeProvisionProviderRelation
} from "../domain/NodeProvisionProvider";
import { getRelationLabel } from "../utils/Relation";

const { t } = useI18n();

const {
    items: provisionHistory,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    refresh: refreshHistory,
    loading: historyLoading,
    error: historyError
} = useServerPagination((page, limit) => nauliteClient.listNodeProvisions({ page, limit }), 10);

onMounted(() => {
    void refreshHistory();
});
</script>

<template>
    <PageLayout title-key="pages.provision.title" hint-key="pages.provision.hint">
        <template #actions>
            <button
                type="button"
                class="btn btn-ghost btn-sm"
                :class="{ loading: historyLoading }"
                :disabled="historyLoading"
                @click="refreshHistory"
            >
                {{ t("pages.provision.refresh") }}
            </button>
            <RouterLink to="/provision/new" class="btn btn-primary btn-sm">
                {{ t("pages.provision.newAction") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="historyError" />

        <div v-if="historyLoading && provisionHistory.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!historyError && provisionHistory.length === 0"
            title-key="pages.provision.emptyTitle"
            description-key="pages.provision.emptyDescription"
            action-label-key="pages.provision.newAction"
            action-to="/provision/new"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body gap-4 p-0 sm:p-6">
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("pages.provision.provider") }}</th>
                                <th>{{ t("common.status") }}</th>
                                <th>{{ t("pages.provision.instanceType") }}</th>
                                <th>{{ t("common.actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="provision in provisionHistory" :key="provision.id">
                                <td class="font-mono text-xs">
                                    {{ provision.id }}
                                </td>
                                <td>{{ getRelationLabel(NodeProvisionProviderRelation, provision.provider, t) }}</td>
                                <td><StatusPill :status="provision.status" /></td>
                                <td class="font-mono text-sm">
                                    {{ provision.instanceType }}
                                </td>
                                <td>
                                    <RouterLink
                                        :to="`/provision/${provision.id}`"
                                        class="btn btn-outline btn-sm"
                                    >
                                        {{ t("pages.provision.viewStatus") }}
                                    </RouterLink>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="flex items-center justify-end gap-2 px-4 pb-4 sm:px-0 sm:pb-0">
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
