<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
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
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { getRelationLabel } from "../utils/Relation";
import {
    formatNodeCpuUsage,
    formatNodeMemoryUsage,
    formatNodeOsLabel
} from "../utils/formatNodePresentation";

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();

const canProvision = computed(() => auth.hasPermission("nodes:provision"));
const canConnectAgent = computed(() => auth.hasPermission("netbird:read"));
const canAddNode = computed(() => canProvision.value || canConnectAgent.value);

/**
 * How often the nodes table reloads status from the control plane.
 */
const NODE_LIST_POLL_MS = 5_000;

let nodeListPollTimer: ReturnType<typeof setInterval> | null = null;

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
    void refreshAll();

    nodeListPollTimer = setInterval(() => {
        void store.refreshOverview({ silent: true });
    }, NODE_LIST_POLL_MS);
});

onUnmounted(() => {
    if (!nodeListPollTimer) {
        return;
    }

    clearInterval(nodeListPollTimer);
    nodeListPollTimer = null;
});

/**
 * Reloads cluster nodes and optional provisioning history.
 *
 * @returns Nothing.
 */
async function refreshAll(): Promise<void> {
    await store.refreshOverview();

    if (canProvision.value) {
        await refreshHistory();
    }
}
</script>

<template>
    <PageLayout title-key="pages.nodes.title" hint-key="pages.nodes.hint">
        <template #actions>
            <button
                type="button"
                class="btn btn-ghost btn-sm"
                :class="{ loading: store.loading || historyLoading }"
                :disabled="store.loading || historyLoading"
                @click="refreshAll"
            >
                {{ t("pages.nodes.refresh") }}
            </button>
            <RouterLink
                v-if="canAddNode"
                to="/nodes/new"
                class="btn btn-primary btn-sm"
            >
                {{ t("pages.provision.newAction") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="store.error || historyError" />

        <div class="flex w-full flex-col gap-8">
            <section class="w-full space-y-3">
                <div>
                    <h2 class="text-lg font-semibold">
                        {{ t("pages.nodes.clusterSectionTitle") }}
                    </h2>
                    <p class="text-sm text-base-content/70">
                        {{ t("pages.nodes.clusterSectionHint") }}
                    </p>
                </div>

                <div v-if="store.loading && store.nodes.length === 0" class="flex items-center gap-2">
                    <LoadingSpinner />
                    <span>{{ t("common.loading") }}</span>
                </div>

                <EmptyState
                    v-else-if="!store.error && store.nodes.length === 0"
                    title-key="pages.nodes.emptyTitle"
                    description-key="pages.nodes.emptyDescription"
                    :action-label-key="canAddNode ? 'pages.provision.newAction' : 'pages.nodes.emptyAction'"
                    :action-to="canAddNode ? '/nodes/new' : '/runs/deploy'"
                />

                <div v-else-if="!store.error" class="card w-full bg-base-100 shadow">
                    <div class="card-body w-full overflow-x-auto p-0 sm:p-6">
                        <table class="table table-zebra w-full">
                            <thead>
                                <tr>
                                    <th>{{ t("common.id") }}</th>
                                    <th>{{ t("common.tableColumns.hostname") }}</th>
                                    <th>{{ t("pages.nodeDetail.os") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("pages.metrics.nodeCpu") }}</th>
                                    <th>{{ t("pages.metrics.nodeMemory") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="node in store.nodes" :key="node.id">
                                    <td>{{ node.id }}</td>
                                    <td>
                                        <RouterLink :to="`/nodes/${node.id}`" class="link link-primary">
                                            {{ node.hostname }}
                                        </RouterLink>
                                    </td>
                                    <td>{{ formatNodeOsLabel(node.osFamily, node.osVersion) }}</td>
                                    <td><StatusPill :status="node.status" /></td>
                                    <td>{{ formatNodeCpuUsage(node.resources) }}</td>
                                    <td>{{ formatNodeMemoryUsage(node.resources) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <section v-if="canProvision" class="space-y-3">
                <div>
                    <h2 class="text-lg font-semibold">
                        {{ t("pages.provision.history") }}
                    </h2>
                    <p class="text-sm text-base-content/70">
                        {{ t("pages.nodes.provisionSectionHint") }}
                    </p>
                </div>

                <div v-if="historyLoading && provisionHistory.length === 0" class="flex items-center gap-2">
                    <LoadingSpinner />
                    <span>{{ t("common.loading") }}</span>
                </div>

                <EmptyState
                    v-else-if="!historyError && provisionHistory.length === 0"
                    title-key="pages.provision.emptyTitle"
                    description-key="pages.provision.emptyDescription"
                    action-label-key="pages.provision.newAction"
                    action-to="/nodes/new"
                />

                <div v-else class="card w-full bg-base-100 shadow">
                    <div class="card-body w-full gap-4 p-0 sm:p-6">
                        <div class="w-full overflow-x-auto">
                            <table class="table table-zebra w-full">
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
                                                :to="`/nodes/provisions/${provision.id}`"
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
            </section>
        </div>
    </PageLayout>
</template>
