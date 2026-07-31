<script setup lang="ts">
import uPlot from "uplot";
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { RouterLink } from "vue-router";

import type { PromQLSeries } from "@naulite/sdk";
import "uplot/dist/uPlot.min.css";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ChartEmptyState from "../components/ui/ChartEmptyState.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useClusterStore } from "../stores/Cluster";
import { resolveApiErrorMessage } from "../utils/ApiErrorMessage";

const { t, locale } = useI18n();
const store = useClusterStore();
const selectedNodeId = ref("");
const loading = ref(false);
const error = ref("");
const lastRefreshedAt = ref<Date | null>(null);
const clusterCpuHasData = ref(false);
const clusterMemHasData = ref(false);
const nodeCpuHasData = ref(false);
const nodeMemHasData = ref(false);
const clusterCpuChart = ref<HTMLElement | null>(null);
const clusterMemChart = ref<HTMLElement | null>(null);
const nodeCpuChart = ref<HTMLElement | null>(null);
const nodeMemChart = ref<HTMLElement | null>(null);
const agentMetricsReachable = ref<boolean | null>(null);
const instanceRows = ref<Array<{ instanceId: string; serviceName: string; cpu: string; memory: string }>>([]);

let clusterCpuPlot: uPlot | null = null;
let clusterMemPlot: uPlot | null = null;
let nodeCpuPlot: uPlot | null = null;
let nodeMemPlot: uPlot | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const selectedNode = computed(() => store.nodes.find((node) => node.id === selectedNodeId.value) ?? null);

const onlineNodeCount = computed(() =>
    store.nodes.filter((node) => node.status === "online").length
);

const metricsAvailable = computed(() =>
    clusterCpuHasData.value
    || clusterMemHasData.value
    || nodeCpuHasData.value
    || nodeMemHasData.value
    || instanceRows.value.length > 0
);

const showAgentUnreachableBanner = computed(() =>
    !loading.value
    && !error.value
    && onlineNodeCount.value > 0
    && agentMetricsReachable.value === false
);

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

onMounted(async () => {
    await store.refreshOverview();
    selectedNodeId.value = store.nodes[0]?.id ?? "";
    await refreshMetrics();
    refreshTimer = setInterval(() => {
        void refreshMetrics();
    }, 30000);
});

onBeforeUnmount(() => {
    destroyPlots();

    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
});

/**
 * Destroys active uPlot instances.
 *
 * @returns Nothing.
 */
function destroyPlots(): void {
    clusterCpuPlot?.destroy();
    clusterMemPlot?.destroy();
    nodeCpuPlot?.destroy();
    nodeMemPlot?.destroy();
    clusterCpuPlot = null;
    clusterMemPlot = null;
    nodeCpuPlot = null;
    nodeMemPlot = null;
}

/**
 * Builds unix second range for the last hour.
 *
 * @returns Start and end timestamps
 */
function lastHourRange(): { start: string; end: string } {
    const end = Math.floor(Date.now() / 1000);
    const start = end - 3600;

    return { start: String(start), end: String(end) };
}

/**
 * Converts a PromQL matrix series into uPlot data arrays.
 *
 * @param series PromQL time series
 * @returns uPlot data tuple
 */
function toPlotData(series: PromQLSeries | undefined): [number[], number[]] {
    if (!series) {
        return [[], []];
    }

    const xs: number[] = [];
    const ys: number[] = [];

    for (const [timestamp, value] of series.values) {
        xs.push(timestamp);
        ys.push(Number(value));
    }

    return [xs, ys];
}

/**
 * Returns whether a plot has at least one point.
 *
 * @param data uPlot data tuple
 * @returns `true` when the series has values
 */
function hasPlotData(data: [number[], number[]]): boolean {
    return data[0].length > 0;
}

/**
 * Renders or updates a uPlot chart in the given container.
 *
 * @param container Target element
 * @param label Series label for the legend
 * @param data uPlot data tuple
 * @param color Line color
 * @param existing Existing plot instance
 * @returns Updated plot instance
 */
function renderPlot(
    container: HTMLElement | null,
    label: string,
    data: [number[], number[]],
    color: string,
    existing: uPlot | null
): uPlot | null {
    if (!container) {
        return existing;
    }

    existing?.destroy();

    return new uPlot(
        {
            width: container.clientWidth || 640,
            height: 220,
            series: [
                {},
                {
                    label,
                    stroke: color,
                    width: 2
                }
            ],
            axes: [
                {
                    stroke: "rgba(255, 255, 255, 0.35)",
                    grid: {
                        stroke: "rgba(255, 255, 255, 0.08)"
                    }
                },
                {
                    stroke: "rgba(255, 255, 255, 0.35)",
                    grid: {
                        stroke: "rgba(255, 255, 255, 0.08)"
                    }
                }
            ],
            legend: {
                show: true
            },
            cursor: {
                show: true
            }
        },
        data,
        container
    );
}

/**
 * Picks the first matrix series optionally filtered by node id.
 *
 * @param result PromQL matrix results
 * @param nodeId Optional node id label filter
 * @returns Matching series or undefined
 */
function pickSeries(result: PromQLSeries[] | undefined, nodeId?: string): PromQLSeries | undefined {
    if (!result || result.length === 0) {
        return undefined;
    }

    if (!nodeId) {
        return result[0];
    }

    return result.find((series) => series.metric.node_id === nodeId) ?? result[0];
}

/**
 * Reloads cluster, node, and instance metrics charts.
 *
 * @returns Nothing.
 */
async function refreshMetrics(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        if (store.nodes.length === 0) {
            destroyPlots();
            clusterCpuHasData.value = false;
            clusterMemHasData.value = false;
            nodeCpuHasData.value = false;
            nodeMemHasData.value = false;
            instanceRows.value = [];
            agentMetricsReachable.value = null;
            lastRefreshedAt.value = new Date();
            return;
        }

        const range = lastHourRange();

        const [clusterCpu, clusterMem, nodeCpu, nodeMem, instanceCpu, instanceMem, agentUp] = await Promise.all([
            nauliteClient.queryMetricsRange(
                "sum(naulite_node_cpu_millis_used)",
                range.start,
                range.end
            ),
            nauliteClient.queryMetricsRange(
                "sum(naulite_node_memory_mb_used)",
                range.start,
                range.end
            ),
            nauliteClient.queryMetricsRange(
                "naulite_node_cpu_millis_used",
                range.start,
                range.end
            ),
            nauliteClient.queryMetricsRange(
                "naulite_node_memory_mb_used",
                range.start,
                range.end
            ),
            nauliteClient.queryMetrics("naulite_instance_cpu_percent"),
            nauliteClient.queryMetrics("naulite_instance_memory_bytes"),
            nauliteClient.queryMetrics("naulite_agent_up")
        ]);

        agentMetricsReachable.value = (agentUp.data?.result?.length ?? 0) > 0;

        const clusterCpuData = toPlotData(pickSeries(clusterCpu.data?.result));
        const nextClusterCpuHasData = hasPlotData(clusterCpuData);

        if (!nextClusterCpuHasData) {
            clusterCpuPlot?.destroy();
            clusterCpuPlot = null;
        }

        clusterCpuHasData.value = nextClusterCpuHasData;

        if (nextClusterCpuHasData) {
            await nextTick();
            clusterCpuPlot = renderPlot(
                clusterCpuChart.value,
                t("pages.metrics.clusterCpu"),
                clusterCpuData,
                "#7cc4ff",
                clusterCpuPlot
            );
        }

        const clusterMemData = toPlotData(pickSeries(clusterMem.data?.result));
        const nextClusterMemHasData = hasPlotData(clusterMemData);

        if (!nextClusterMemHasData) {
            clusterMemPlot?.destroy();
            clusterMemPlot = null;
        }

        clusterMemHasData.value = nextClusterMemHasData;

        if (nextClusterMemHasData) {
            await nextTick();
            clusterMemPlot = renderPlot(
                clusterMemChart.value,
                t("pages.metrics.clusterMemory"),
                clusterMemData,
                "#3fb950",
                clusterMemPlot
            );
        }

        if (selectedNodeId.value) {
            const nodeCpuData = toPlotData(pickSeries(nodeCpu.data?.result, selectedNodeId.value));
            const nextNodeCpuHasData = hasPlotData(nodeCpuData);

            if (!nextNodeCpuHasData) {
                nodeCpuPlot?.destroy();
                nodeCpuPlot = null;
            }

            nodeCpuHasData.value = nextNodeCpuHasData;

            if (nextNodeCpuHasData) {
                await nextTick();
                nodeCpuPlot = renderPlot(
                    nodeCpuChart.value,
                    t("pages.metrics.nodeCpu"),
                    nodeCpuData,
                    "#d2a8ff",
                    nodeCpuPlot
                );
            }

            const nodeMemData = toPlotData(pickSeries(nodeMem.data?.result, selectedNodeId.value));
            const nextNodeMemHasData = hasPlotData(nodeMemData);

            if (!nextNodeMemHasData) {
                nodeMemPlot?.destroy();
                nodeMemPlot = null;
            }

            nodeMemHasData.value = nextNodeMemHasData;

            if (nextNodeMemHasData) {
                await nextTick();
                nodeMemPlot = renderPlot(
                    nodeMemChart.value,
                    t("pages.metrics.nodeMemory"),
                    nodeMemData,
                    "#ffa657",
                    nodeMemPlot
                );
            }
        } else {
            nodeCpuHasData.value = false;
            nodeMemHasData.value = false;
            nodeCpuPlot?.destroy();
            nodeMemPlot?.destroy();
            nodeCpuPlot = null;
            nodeMemPlot = null;
        }

        const cpuByInstance = new Map<string, string>();
        const memByInstance = new Map<string, string>();

        for (const sample of instanceCpu.data?.result ?? []) {
            const instanceId = sample.metric.instance_id ?? sample.metric.instanceId ?? "-";
            cpuByInstance.set(instanceId, sample.value[1] ?? "-");
        }

        for (const sample of instanceMem.data?.result ?? []) {
            const instanceId = sample.metric.instance_id ?? sample.metric.instanceId ?? "-";
            memByInstance.set(instanceId, sample.value[1] ?? "-");
        }

        const instanceIds = new Set([...cpuByInstance.keys(), ...memByInstance.keys()]);
        instanceRows.value = [...instanceIds].map((instanceId) => ({
            instanceId,
            serviceName: instanceCpu.data?.result?.find((entry) =>
                (entry.metric.instance_id ?? entry.metric.instanceId) === instanceId
            )?.metric.service_name ?? "-",

            cpu: cpuByInstance.get(instanceId) ?? "-",
            memory: memByInstance.get(instanceId) ?? "-"
        }));
        lastRefreshedAt.value = new Date();
    } catch (err) {
        error.value = resolveApiErrorMessage(err, t, (key) => key.startsWith("errors."));
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.metrics.title" hint-key="pages.metrics.hint">
        <template #actions>
            <span v-if="lastUpdatedLabel" class="self-center text-xs text-base-content/60">
                {{ t("pages.metrics.lastUpdated", { time: lastUpdatedLabel }) }}
            </span>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :class="{ loading }"
                :disabled="loading || store.nodes.length === 0"
                @click="refreshMetrics"
            >
                <span>{{ t("pages.metrics.refresh") }}</span>
            </button>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="loading && store.nodes.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && store.nodes.length === 0"
            title-key="pages.metrics.noNodesTitle"
            description-key="pages.metrics.noNodesDescription"
            action-label-key="pages.metrics.noNodesAction"
            action-to="/nodes"
        />

        <div v-else class="flex flex-col gap-6">
            <div class="stats w-full bg-base-100 shadow lg:stats-horizontal">
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.metrics.statNodes") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ store.nodes.length }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.metrics.statNodesOnline", { count: onlineNodeCount }) }}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.metrics.statInstances") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ instanceRows.length }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.metrics.statInstancesHint") }}
                    </div>
                </div>
                <div class="stat">
                    <div class="stat-title">
                        {{ t("pages.metrics.statWindow") }}
                    </div>
                    <div class="stat-value text-2xl">
                        {{ t("pages.metrics.statWindowValue") }}
                    </div>
                    <div class="stat-desc">
                        {{ t("pages.metrics.statWindowHint") }}
                    </div>
                </div>
            </div>

            <div
                v-if="showAgentUnreachableBanner"
                class="alert border-warning/30 bg-warning/10 text-sm"
            >
                <div class="flex w-full flex-wrap items-center justify-between gap-3">
                    <span>{{ t("pages.metrics.agentUnreachableDescription") }}</span>
                    <RouterLink to="/nodes" class="btn btn-ghost btn-sm">
                        {{ t("pages.metrics.viewNodes") }}
                    </RouterLink>
                </div>
            </div>

            <div
                v-else-if="!loading && !error && !metricsAvailable"
                class="alert border-info/30 bg-info/10 text-sm"
            >
                <span>{{ t("pages.metrics.pendingDescription") }}</span>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-3">
                        <h2 class="card-title text-base">
                            {{ t("pages.metrics.clusterCpu") }}
                        </h2>
                        <ChartEmptyState
                            v-if="!clusterCpuHasData"
                            title-key="pages.metrics.chartsEmptyTitle"
                            description-key="pages.metrics.chartsEmptyDescription"
                        />
                        <div v-else ref="clusterCpuChart" class="min-h-[220px] w-full" />
                    </div>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-3">
                        <h2 class="card-title text-base">
                            {{ t("pages.metrics.clusterMemory") }}
                        </h2>
                        <ChartEmptyState
                            v-if="!clusterMemHasData"
                            title-key="pages.metrics.chartsEmptyTitle"
                            description-key="pages.metrics.chartsEmptyDescription"
                        />
                        <div v-else ref="clusterMemChart" class="min-h-[220px] w-full" />
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.metrics.nodeSectionTitle") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.metrics.nodeSectionHint") }}
                            </p>
                        </div>
                        <label class="form-control w-full max-w-md">
                            <span class="label-text">{{ t("pages.metrics.selectNode") }}</span>
                            <select v-model="selectedNodeId" class="select select-bordered select-sm w-full" @change="refreshMetrics">
                                <option v-for="node in store.nodes" :key="node.id" :value="node.id">
                                    {{ node.hostname }} ({{ node.id }})
                                </option>
                            </select>
                        </label>
                    </div>

                    <p v-if="selectedNode" class="text-sm text-base-content/70">
                        {{ t("pages.metrics.nodeDetail") }}: {{ selectedNode.hostname }}
                    </p>

                    <div class="grid gap-4 lg:grid-cols-2">
                        <div class="rounded-lg border border-base-300/60 p-4">
                            <h3 class="mb-3 text-sm font-semibold">
                                {{ t("pages.metrics.nodeCpu") }}
                            </h3>
                            <ChartEmptyState
                                v-if="!nodeCpuHasData"
                                compact
                                title-key="pages.metrics.chartsEmptyTitle"
                            />
                            <div v-else ref="nodeCpuChart" class="min-h-[220px] w-full" />
                        </div>

                        <div class="rounded-lg border border-base-300/60 p-4">
                            <h3 class="mb-3 text-sm font-semibold">
                                {{ t("pages.metrics.nodeMemory") }}
                            </h3>
                            <ChartEmptyState
                                v-if="!nodeMemHasData"
                                compact
                                title-key="pages.metrics.chartsEmptyTitle"
                            />
                            <div v-else ref="nodeMemChart" class="min-h-[220px] w-full" />
                        </div>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div>
                        <h2 class="text-lg font-semibold">
                            {{ t("pages.metrics.instances") }}
                        </h2>
                        <p class="text-sm text-base-content/70">
                            {{ t("pages.metrics.instancesHint") }}
                        </p>
                    </div>

                    <EmptyState
                        v-if="instanceRows.length === 0 && !loading"
                        title-key="pages.metrics.instancesEmptyTitle"
                        description-key="pages.metrics.instancesEmptyDescription"
                    />

                    <div v-else-if="instanceRows.length > 0" class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("pages.metrics.instanceId") }}</th>
                                    <th>{{ t("pages.metrics.serviceName") }}</th>
                                    <th>{{ t("pages.metrics.instanceCpu") }}</th>
                                    <th>{{ t("pages.metrics.instanceMemory") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in instanceRows" :key="row.instanceId">
                                    <td>{{ row.instanceId }}</td>
                                    <td>{{ row.serviceName }}</td>
                                    <td>{{ row.cpu }}</td>
                                    <td>{{ row.memory }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
