<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { HostUpdateRun, Instance } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import HostPackageInventoryCard from "../components/nodes/HostPackageInventoryCard.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import MetadataGrid from "../components/ui/MetadataGrid.vue";
import MetadataGridItem from "../components/ui/MetadataGridItem.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useClusterStore } from "../stores/Cluster";
import { formatNodeOsLabel } from "../utils/formatNodePresentation";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useClusterStore();

const nodeId = computed(() => String(route.params.id));
const node = computed(() => store.nodes.find((entry) => entry.id === nodeId.value) ?? null);
const nodeInstances = ref<Instance[]>([]);
const workloadsLoading = ref(false);
const workloadsError = ref<ParsedApiError | null>(null);
const updateRuns = ref<HostUpdateRun[]>([]);
const packageManager = ref("");
const nodesReady = ref(false);

const supportsHostInventory = computed(() => node.value?.osFamily === "linux");

const showAgentUnreachableBanner = computed(() => node.value?.status === "offline");

const runningInstanceCount = computed(() =>
    nodeInstances.value.filter((entry) => entry.status === "running").length
);

onMounted(async () => {
    if (store.nodes.length === 0) {
        await store.refreshOverview({ silent: true });
    }

    nodesReady.value = true;
    await refreshWorkloads();
    await refreshUpdates();
});

/**
 * Stores the package manager reported with the current inventory page.
 *
 * @param payload Inventory header from the packages card
 * @returns Nothing.
 */
function onInventoryLoaded(payload: { packageManager: string }): void {
    packageManager.value = payload.packageManager;
}

/**
 * Reloads workload instances scheduled on this node.
 *
 * @returns Nothing.
 */
async function refreshWorkloads(): Promise<void> {
    workloadsLoading.value = true;
    workloadsError.value = null;

    try {
        nodeInstances.value = await nauliteClient.listInstances({ nodeId: nodeId.value });
    } catch (err) {
        nodeInstances.value = [];
        workloadsError.value = parseApiError(err);
    } finally {
        workloadsLoading.value = false;
    }
}

/**
 * Opens the instance detail page.
 *
 * @param instanceId Instance identifier
 * @returns Nothing.
 */
function openInstance(instanceId: string): void {
    void router.push(`/instances/${instanceId}`);
}

/**
 * Reloads historical host update runs.
 *
 * @returns Nothing.
 */
async function refreshUpdates(): Promise<void> {
    if (!supportsHostInventory.value) {
        return;
    }

    updateRuns.value = await store.listNodeHostUpdates(nodeId.value);
}
</script>

<template>
    <PageLayout title-key="pages.nodeDetail.title" hint-key="pages.nodeDetail.hint">
        <template #actions>
            <RouterLink to="/nodes" class="btn btn-ghost btn-sm">
                {{ t("pages.nodeDetail.back") }}
            </RouterLink>
        </template>

        <div
            v-if="showAgentUnreachableBanner"
            class="alert border-warning/30 bg-warning/10 text-sm"
        >
            <div class="flex w-full flex-col gap-2">
                <p class="font-medium">
                    {{ t("pages.nodeDetail.agentUnreachableTitle") }}
                </p>
                <p>{{ t("pages.nodeDetail.agentUnreachableDescription") }}</p>
                <p v-if="node?.agentUrl" class="text-base-content/70">
                    {{ t("pages.nodeDetail.agentUrlLabel") }}:
                    <span class="font-mono">{{ node.agentUrl }}</span>
                </p>
            </div>
        </div>

        <div class="space-y-6">
            <div class="card bg-base-100 shadow">
                <div class="card-body gap-3">
                    <h2 class="card-title text-lg">
                        {{ node?.hostname ?? nodeId }}
                    </h2>
                    <MetadataGrid :columns="4">
                        <MetadataGridItem :label="t('common.status')">
                            <StatusPill v-if="node" :status="node.status" />
                            <span v-else>-</span>
                        </MetadataGridItem>
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.os')"
                            :value="formatNodeOsLabel(node?.osFamily, node?.osVersion)"
                        />
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.arch')"
                            :value="node?.arch"
                        />
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.packageManager')"
                            :value="packageManager || undefined"
                        />
                    </MetadataGrid>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 class="text-lg font-semibold">
                                {{ t("pages.nodeDetail.workloadsTitle") }}
                            </h3>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.nodeDetail.workloadsHint") }}
                            </p>
                        </div>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="workloadsLoading"
                            @click="refreshWorkloads"
                        >
                            {{ t("pages.nodeDetail.workloadsRefresh") }}
                        </button>
                    </div>

                    <ErrorAlert :error="workloadsError" />

                    <div v-if="workloadsLoading && nodeInstances.length === 0" class="flex items-center gap-2">
                        <LoadingSpinner />
                        <span>{{ t("common.loading") }}</span>
                    </div>

                    <EmptyState
                        v-else-if="!workloadsError && nodeInstances.length === 0"
                        title-key="pages.nodeDetail.workloadsEmptyTitle"
                        description-key="pages.nodeDetail.workloadsEmptyDescription"
                        action-label-key="pages.nodeDetail.workloadsEmptyAction"
                        action-to="/runs/deploy"
                    />

                    <template v-else-if="!workloadsError">
                        <div class="flex flex-wrap gap-2">
                            <span class="badge badge-ghost">
                                {{ t("pages.nodeDetail.workloadsStatsTotal", { count: nodeInstances.length }) }}
                            </span>
                            <span
                                class="badge"
                                :class="runningInstanceCount > 0 ? 'badge-success' : 'badge-ghost'"
                            >
                                {{ t("pages.nodeDetail.workloadsStatsRunning", { count: runningInstanceCount }) }}
                            </span>
                        </div>

                        <div class="overflow-x-auto rounded-box border border-base-300">
                            <table class="table table-zebra">
                                <thead>
                                    <tr>
                                        <th>{{ t("common.id") }}</th>
                                        <th>{{ t("common.tableColumns.service") }}</th>
                                        <th>{{ t("common.status") }}</th>
                                        <th>{{ t("common.tableColumns.image") }}</th>
                                        <th>{{ t("pages.nodeDetail.containerId") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="instance in nodeInstances"
                                        :key="instance.id"
                                        class="cursor-pointer hover:bg-base-200/60"
                                        @click="openInstance(instance.id)"
                                    >
                                        <td>
                                            <RouterLink
                                                :to="`/instances/${instance.id}`"
                                                class="link link-hover font-mono text-sm"
                                                @click.stop
                                            >
                                                {{ instance.id }}
                                            </RouterLink>
                                        </td>
                                        <td>
                                            <RouterLink
                                                :to="`/services/${instance.serviceName}`"
                                                class="link link-primary"
                                                @click.stop
                                            >
                                                {{ instance.serviceName }}
                                            </RouterLink>
                                        </td>
                                        <td><StatusPill :status="instance.status" /></td>
                                        <td class="max-w-xs truncate font-mono text-xs" :title="instance.image">
                                            {{ instance.image }}
                                        </td>
                                        <td class="font-mono text-xs">
                                            {{ instance.containerId ?? "-" }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </template>
                </div>
            </div>

            <HostPackageInventoryCard
                :node-id="nodeId"
                :ready="nodesReady"
                :supports-host-inventory="supportsHostInventory"
                :show-agent-unreachable="showAgentUnreachableBanner"
                @loaded="onInventoryLoaded"
                @updated="refreshUpdates"
            />

            <div v-if="updateRuns.length > 0" class="card bg-base-100 shadow">
                <div class="card-body">
                    <h3 class="text-lg font-semibold">
                        {{ t("pages.nodeDetail.recentUpdates") }}
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.id") }}</th>
                                    <th>{{ t("pages.nodeDetail.updateKind") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("pages.nodeDetail.reboot") }}</th>
                                    <th>{{ t("pages.nodeDetail.completedAt") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="run in updateRuns" :key="run.id">
                                    <td>{{ run.id }}</td>
                                    <td>{{ run.kind }}</td>
                                    <td><StatusPill :status="run.status" /></td>
                                    <td>{{ run.rebootRequired ? t("common.yes") : t("common.no") }}</td>
                                    <td>{{ run.completedAt ?? "-" }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

    </PageLayout>
</template>
