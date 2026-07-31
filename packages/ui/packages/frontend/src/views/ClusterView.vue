<script setup lang="ts">
import { Activity, Box, Cloud, LayoutDashboard, Server, Upload } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t, locale } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();
const lastRefreshedAt = ref<Date | null>(null);

const status = computed(() => store.clusterStatus);
const summary = computed(() => status.value?.summary);
const nodes = computed(() => status.value?.nodes ?? []);
const onlineNodes = computed(() => summary.value?.onlineNodes ?? 0);
const totalNodes = computed(() => summary.value?.nodes ?? status.value?.health.nodeCount ?? 0);
const totalServices = computed(() => summary.value?.services ?? status.value?.health.serviceCount ?? 0);
const totalInstances = computed(() => summary.value?.instances ?? 0);
const runningInstances = computed(() => summary.value?.runningInstances ?? 0);
const applyRevision = computed(() => summary.value?.applyRevision ?? status.value?.revision ?? "-");

const lastUpdatedLabel = computed(() => {
    if (!lastRefreshedAt.value) {
        return "";
    }

    return new Intl.DateTimeFormat(locale.value, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(lastRefreshedAt.value);
});

const healthHintKey = computed(() => {
    const health = status.value?.health.status;

    if (health === "unhealthy") {
        return "pages.cluster.healthUnhealthy";
    }

    if (totalNodes.value === 0) {
        return "pages.cluster.healthNoNodes";
    }

    if (onlineNodes.value === 0) {
        return "pages.cluster.healthNodesOffline";
    }

    return "pages.cluster.healthHealthy";
});

const quickLinks = computed(() => {
    const links = [
        {
            to: "/nodes",
            labelKey: "pages.cluster.linkNodes",
            hintKey: "pages.cluster.linkNodesHint",
            icon: Server,
            permission: "nodes:read" as const
        },
        {
            to: "/metrics",
            labelKey: "pages.cluster.linkMetrics",
            hintKey: "pages.cluster.linkMetricsHint",
            icon: Activity,
            permission: "metrics:read" as const
        },
        {
            to: "/services",
            labelKey: "pages.cluster.linkServices",
            hintKey: "pages.cluster.linkServicesHint",
            icon: Box,
            permission: "workloads:read" as const
        },
        {
            to: "/deploy",
            labelKey: "pages.cluster.linkDeploy",
            hintKey: "pages.cluster.linkDeployHint",
            icon: Upload,
            permission: "manifests:apply" as const
        }
    ];

    if (auth.hasPermission("nodes:provision")) {
        links.splice(1, 0, {
            to: "/nodes/new",
            labelKey: "pages.cluster.linkProvision",
            hintKey: "pages.cluster.linkProvisionHint",
            icon: Cloud,
            permission: "nodes:provision"
        });
    }

    return links.filter((link) => auth.hasPermission(link.permission));
});

onMounted(() => {
    void refreshStatus();
});

/**
 * Reloads cluster status from the control plane.
 *
 * @returns Nothing.
 */
async function refreshStatus(): Promise<void> {
    await store.refreshClusterStatus();
    lastRefreshedAt.value = new Date();
}
</script>

<template>
    <PageLayout title-key="pages.cluster.title" hint-key="pages.cluster.hint">
        <template #actions>
            <span v-if="lastUpdatedLabel" class="self-center text-xs text-base-content/60">
                {{ t("pages.cluster.lastUpdated", { time: lastUpdatedLabel }) }}
            </span>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :class="{ loading: store.loading }"
                :disabled="store.loading"
                @click="refreshStatus"
            >
                {{ t("pages.cluster.refresh") }}
            </button>
        </template>

        <ErrorAlert :error="store.error" />

        <div v-if="store.loading && !status" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && !status"
            title-key="pages.cluster.emptyTitle"
            description-key="pages.cluster.emptyDescription"
            action-label-key="pages.cluster.refresh"
            @action="refreshStatus"
        />

        <div v-else-if="status" class="flex flex-col gap-6">
            <div
                class="alert text-sm"
                :class="{
                    'border-success/30 bg-success/10': status.health.status === 'healthy',
                    'border-warning/30 bg-warning/10': status.health.status === 'degraded',
                    'border-error/30 bg-error/10': status.health.status === 'unhealthy'
                }"
            >
                <div class="flex w-full flex-wrap items-center justify-between gap-3">
                    <div class="flex flex-wrap items-center gap-3">
                        <StatusPill :status="status.health.status" size="md" />
                        <span>{{ t(healthHintKey) }}</span>
                    </div>
                    <RouterLink
                        v-if="totalNodes === 0 && auth.hasPermission('nodes:provision')"
                        to="/nodes/new"
                        class="btn btn-primary btn-sm"
                    >
                        {{ t("pages.cluster.provisionAction") }}
                    </RouterLink>
                </div>
            </div>

            <div class="stats w-full bg-base-100 shadow lg:stats-horizontal">
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.cluster.statNodes") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ totalNodes }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.cluster.statNodesOnline", { count: onlineNodes }) }}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.cluster.statServices") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ totalServices }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.cluster.statServicesHint") }}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.cluster.statInstances") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ totalInstances }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.cluster.statInstancesRunning", { count: runningInstances }) }}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.cluster.statRevision") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ applyRevision }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.cluster.statRevisionHint") }}
                    </div>
                </div>
            </div>

            <div class="grid gap-6 xl:grid-cols-3">
                <div class="card bg-base-100 shadow xl:col-span-1">
                    <div class="card-body gap-4">
                        <div class="flex items-center gap-2">
                            <LayoutDashboard class="size-5 text-primary" />
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.cluster.controlPlaneTitle") }}
                            </h2>
                        </div>

                        <dl class="grid gap-3 text-sm">
                            <div>
                                <dt class="text-xs text-base-content/60">
                                    {{ t("pages.cluster.controlPlaneId") }}
                                </dt>
                                <dd class="font-mono">
                                    {{ status.health.controlPlaneId ?? "-" }}
                                </dd>
                            </div>
                            <div>
                                <dt class="text-xs text-base-content/60">
                                    {{ t("pages.cluster.leaderId") }}
                                </dt>
                                <dd class="font-mono">
                                    {{ status.leaderId ?? "-" }}
                                </dd>
                            </div>
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <dt class="text-xs text-base-content/60">
                                        {{ t("pages.cluster.workloadVolumes") }}
                                    </dt>
                                    <dd class="text-lg font-semibold">
                                        {{ summary?.volumes ?? 0 }}
                                    </dd>
                                </div>
                                <div>
                                    <dt class="text-xs text-base-content/60">
                                        {{ t("pages.cluster.workloadSecrets") }}
                                    </dt>
                                    <dd class="text-lg font-semibold">
                                        {{ summary?.secrets ?? 0 }}
                                    </dd>
                                </div>
                            </div>
                        </dl>
                    </div>
                </div>

                <div class="card bg-base-100 shadow xl:col-span-2">
                    <div class="card-body gap-4">
                        <h2 class="text-lg font-semibold">
                            {{ t("pages.cluster.quickLinksTitle") }}
                        </h2>
                        <p class="text-sm text-base-content/70">
                            {{ t("pages.cluster.quickLinksHint") }}
                        </p>

                        <div class="grid gap-3 sm:grid-cols-2">
                            <RouterLink
                                v-for="link in quickLinks"
                                :key="link.to"
                                :to="link.to"
                                class="flex items-start gap-3 rounded-lg border border-base-300 bg-base-200/40 p-4 transition-colors hover:border-primary/40 hover:bg-base-200"
                            >
                                <component :is="link.icon" class="mt-0.5 size-5 shrink-0 text-primary" />
                                <div>
                                    <p class="font-medium">
                                        {{ t(link.labelKey) }}
                                    </p>
                                    <p class="mt-1 text-xs text-base-content/60">
                                        {{ t(link.hintKey) }}
                                    </p>
                                </div>
                            </RouterLink>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.cluster.nodesPreviewTitle") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.cluster.nodesPreviewHint") }}
                            </p>
                        </div>
                        <RouterLink to="/nodes" class="btn btn-outline btn-sm">
                            {{ t("pages.cluster.viewAllNodes") }}
                        </RouterLink>
                    </div>

                    <EmptyState
                        v-if="nodes.length === 0"
                        title-key="pages.cluster.noNodesTitle"
                        description-key="pages.cluster.noNodesDescription"
                        :action-label-key="auth.hasPermission('nodes:provision') ? 'pages.cluster.provisionAction' : undefined"
                        :action-to="auth.hasPermission('nodes:provision') ? '/nodes/new' : undefined"
                    />

                    <div v-else class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.id") }}</th>
                                    <th>{{ t("common.tableColumns.hostname") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("common.actions") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="node in nodes.slice(0, 5)" :key="node.id">
                                    <td class="font-mono text-xs">
                                        {{ node.id }}
                                    </td>
                                    <td>{{ node.hostname }}</td>
                                    <td><StatusPill :status="node.status" /></td>
                                    <td>
                                        <RouterLink :to="`/nodes/${node.id}`" class="btn btn-ghost btn-xs">
                                            {{ t("pages.cluster.openNode") }}
                                        </RouterLink>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
