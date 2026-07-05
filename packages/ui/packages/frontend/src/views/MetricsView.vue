<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { PromQLSeries } from "@naulite/sdk";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { nauliteClient } from "../api/Client";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const selectedNodeId = ref("");
const loading = ref(false);
const error = ref("");
const clusterCpuChart = ref<HTMLElement | null>(null);
const clusterMemChart = ref<HTMLElement | null>(null);
const nodeCpuChart = ref<HTMLElement | null>(null);
const nodeMemChart = ref<HTMLElement | null>(null);
const instanceRows = ref<Array<{ instanceId: string; serviceName: string; cpu: string; memory: string }>>([]);

let clusterCpuPlot: uPlot | null = null;
let clusterMemPlot: uPlot | null = null;
let nodeCpuPlot: uPlot | null = null;
let nodeMemPlot: uPlot | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

const selectedNode = computed(() => store.nodes.find((node) => node.id === selectedNodeId.value) ?? null);

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
 * Renders or updates a uPlot chart in the given container.
 *
 * @param container Target element
 * @param title Chart title
 * @param data uPlot data tuple
 * @param color Line color
 * @param existing Existing plot instance
 * @returns Updated plot instance
 */
function renderPlot(
    container: HTMLElement | null,
    title: string,
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
            title,
            width: container.clientWidth || 640,
            height: 220,
            series: [
                {},
                {
                    label: title,
                    stroke: color
                }
            ]
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
        const range = lastHourRange();

        const [clusterCpu, clusterMem, nodeCpu, nodeMem, instanceCpu, instanceMem] = await Promise.all([
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
            nauliteClient.queryMetrics("naulite_instance_memory_bytes")
        ]);

        clusterCpuPlot = renderPlot(
            clusterCpuChart.value,
            t("metricsClusterCpu"),
            toPlotData(pickSeries(clusterCpu.data?.result)),
            "#7cc4ff",
            clusterCpuPlot
        );
        clusterMemPlot = renderPlot(
            clusterMemChart.value,
            t("metricsClusterMemory"),
            toPlotData(pickSeries(clusterMem.data?.result)),
            "#3fb950",
            clusterMemPlot
        );

        if (selectedNodeId.value) {
            nodeCpuPlot = renderPlot(
                nodeCpuChart.value,
                t("metricsNodeCpu"),
                toPlotData(pickSeries(nodeCpu.data?.result, selectedNodeId.value)),
                "#d2a8ff",
                nodeCpuPlot
            );
            nodeMemPlot = renderPlot(
                nodeMemChart.value,
                t("metricsNodeMemory"),
                toPlotData(pickSeries(nodeMem.data?.result, selectedNodeId.value)),
                "#ffa657",
                nodeMemPlot
            );
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
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <section>
        <h2>{{ t("metrics") }}</h2>
        <p class="hint">{{ t("metricsHint") }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="loading" class="hint">{{ t("loading") }}</p>

        <div class="panel metrics-grid">
            <div ref="clusterCpuChart" class="chart-panel" />
            <div ref="clusterMemChart" class="chart-panel" />
        </div>

        <div class="panel">
            <label>
                {{ t("metricsSelectNode") }}
                <select v-model="selectedNodeId" @change="refreshMetrics">
                    <option v-for="node in store.nodes" :key="node.id" :value="node.id">
                        {{ node.hostname }} ({{ node.id }})
                    </option>
                </select>
            </label>
            <p v-if="selectedNode" class="hint">{{ t("metricsNodeDetail") }}: {{ selectedNode.hostname }}</p>
            <div class="metrics-grid">
                <div ref="nodeCpuChart" class="chart-panel" />
                <div ref="nodeMemChart" class="chart-panel" />
            </div>
        </div>

        <div class="panel">
            <h3>{{ t("metricsInstances") }}</h3>
            <table>
                <thead>
                    <tr>
                        <th>{{ t("metricsInstanceId") }}</th>
                        <th>{{ t("metricsServiceName") }}</th>
                        <th>{{ t("metricsInstanceCpu") }}</th>
                        <th>{{ t("metricsInstanceMemory") }}</th>
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
            <p v-if="instanceRows.length === 0" class="empty">{{ t("metricsInstancesEmpty") }}</p>
        </div>
    </section>
</template>
