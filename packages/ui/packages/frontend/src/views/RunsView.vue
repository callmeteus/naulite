<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

import type { ListPipelineRunsQuery, PipelineEvent, PipelineRun, PipelineRunKind, PipelineRunStatus } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import { useServerPagination } from "../composables/useServerPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const route = useRoute();
const router = useRouter();
const selectedRun = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const selectedStepId = ref<string | null>(null);
const kindFilter = ref<PipelineRunKind | "">("");
const statusFilter = ref<PipelineRunStatus | "">("");
const streamActive = ref(false);
let streamAbort = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeStreamRunId: string | null = null;

const {
    items: paginatedRuns,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    resetPage,
    refresh: refreshListPage,
    loading: listLoading,
    error: listError
} = useServerPagination(async (page, limit) => {
    const query: ListPipelineRunsQuery = {
        kind: kindFilter.value || undefined,
        status: statusFilter.value || undefined,
        page,
        limit
    };
    return nauliteClient.listRunsPaginated(query);
}, 15);

const selectedStep = computed(() => {
    if (!selectedRun.value?.steps || !selectedStepId.value) {
        return null;
    }

    return selectedRun.value.steps.find((step) => step.id === selectedStepId.value) ?? null;
});

onMounted(async () => {
    await refreshList();

    const runId = typeof route.query.id === "string" ? route.query.id : "";

    if (runId) {
        await loadRunDetail(runId);
    }
});

onBeforeUnmount(() => {
    stopLiveUpdates();
});

watch([kindFilter, statusFilter], () => {
    void resetPage();
});

watch(
    () => (selectedRun.value ? [selectedRun.value.id, selectedRun.value.status] : null),
    (key) => {
        if (!key) {
            stopLiveUpdates();
            return;
        }

        const [runId, status] = key;

        if (status === "pending" || status === "running") {
            void startLiveUpdates(runId);
        } else {
            stopLiveUpdates();
        }
    }
);

/**
 * Reloads the pipeline run list with current filters.
 *
 * @returns Nothing.
 */
async function refreshList(): Promise<void> {
    await refreshListPage();
}

/**
 * Loads run detail and timeline events.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
async function loadRunDetail(runId: string): Promise<void> {
    selectedRun.value = await store.getRun(runId);
    runEvents.value = await store.getRunEvents(runId);
    selectedStepId.value = selectedRun.value.steps?.[0]?.id ?? null;
    await router.replace({ query: { id: runId } });
}

/**
 * Clears the selected run detail panel.
 *
 * @returns Nothing.
 */
function clearSelection(): void {
    selectedRun.value = null;
    runEvents.value = [];
    selectedStepId.value = null;
    void router.replace({ query: {} });
}

/**
 * Selects a pipeline step for log display.
 *
 * @param stepId Pipeline step identifier
 * @returns Nothing.
 */
function selectStep(stepId: string): void {
    selectedStepId.value = stepId;
}

/**
 * Stops SSE streaming and polling timers.
 *
 * @returns Nothing.
 */
function stopLiveUpdates(): void {
    streamAbort = true;
    streamActive.value = false;
    activeStreamRunId = null;

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Refreshes run detail and events from the API.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
async function refreshRunDetail(runId: string): Promise<void> {
    selectedRun.value = await store.getRun(runId);
    runEvents.value = await store.getRunEvents(runId);

    if (
        selectedStepId.value &&
        !selectedRun.value.steps?.some((step) => step.id === selectedStepId.value)
    ) {
        selectedStepId.value = selectedRun.value.steps?.[0]?.id ?? null;
    }
}

/**
 * Starts polling as a fallback when SSE is unavailable.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
function startPolling(runId: string): void {
    if (pollTimer) {
        return;
    }

    pollTimer = setInterval(() => {
        void refreshRunDetail(runId).then(() => {
            const status = selectedRun.value?.status;

            if (status === "succeeded" || status === "failed") {
                stopLiveUpdates();
            }
        });
    }, 3000);
}

/**
 * Streams pipeline events over SSE and refreshes run detail.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
async function startLiveUpdates(runId: string): Promise<void> {
    if (activeStreamRunId === runId && (streamActive.value || pollTimer)) {
        return;
    }

    stopLiveUpdates();
    activeStreamRunId = runId;
    streamAbort = false;
    streamActive.value = true;

    try {
        for await (const event of nauliteClient.streamRunEvents(runId)) {
            if (streamAbort) {
                break;
            }

            if (!runEvents.value.some((entry) => entry.id === event.id)) {
                runEvents.value = [...runEvents.value, event];
            }

            if (
                event.kind.includes("finished") ||
                event.kind.includes("failed") ||
                event.kind === "ci.build.finished" ||
                event.kind === "ci.pipeline.failed"
            ) {
                await refreshRunDetail(runId);
            }
        }

        await refreshRunDetail(runId);
    } catch {
        if (!streamAbort) {
            startPolling(runId);
        }
    } finally {
        streamActive.value = false;
    }
}

/**
 * Returns whether the run is still in progress.
 *
 * @param status Pipeline run status
 * @returns True when the run is pending or running
 */
function isActiveStatus(status: string): boolean {
    return status === "pending" || status === "running";
}
</script>

<template>
    <section>
        <h2>{{ t("runs") }}</h2>
        <p class="hint">{{ t("runsHint") }}</p>
        <p v-if="store.error || listError" class="error">{{ store.error || listError }}</p>

        <div class="panel filters">
            <label>
                {{ t("runsKindFilter") }}
                <select v-model="kindFilter">
                    <option value="">{{ t("runsFilterAll") }}</option>
                    <option value="ci_build">ci_build</option>
                    <option value="apply">apply</option>
                    <option value="gitops_sync">gitops_sync</option>
                    <option value="node_event">node_event</option>
                </select>
            </label>
            <label>
                {{ t("runsStatusFilter") }}
                <select v-model="statusFilter">
                    <option value="">{{ t("runsFilterAll") }}</option>
                    <option value="pending">pending</option>
                    <option value="running">running</option>
                    <option value="succeeded">succeeded</option>
                    <option value="failed">failed</option>
                </select>
            </label>
            <button type="button" :disabled="listLoading" @click="refreshList">
                {{ t("runsRefresh") }}
            </button>
        </div>

        <div class="panel">
            <p v-if="listLoading">{{ t("loading") }}</p>
            <table v-else>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Kind</th>
                        <th>Status</th>
                        <th>Service</th>
                        <th>Started</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="run in paginatedRuns" :key="run.id">
                        <td>{{ run.id }}</td>
                        <td>{{ run.kind }}</td>
                        <td>{{ run.status }}</td>
                        <td>{{ run.serviceName ?? "-" }}</td>
                        <td>{{ run.startedAt ?? run.createdAt }}</td>
                        <td>
                            <button type="button" @click="loadRunDetail(run.id)">
                                {{ t("runsViewDetails") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="paginatedRuns.length > 0" class="pagination">
                <button type="button" :disabled="!canGoPrevious" @click="previousPage">
                    {{ t("paginationPrevious") }}
                </button>
                <span>{{ pageLabel }}</span>
                <button type="button" :disabled="!canGoNext" @click="nextPage">
                    {{ t("paginationNext") }}
                </button>
            </div>
        </div>

        <div v-if="selectedRun" class="panel">
            <h3>{{ t("runsDetailTitle") }}: {{ selectedRun.id }}</h3>
            <button type="button" @click="clearSelection">{{ t("runsCloseDetail") }}</button>
            <p>
                {{ t("runsStatusFilter") }}: {{ selectedRun.status }}
                <span v-if="streamActive" class="hint"> ({{ t("runsStreaming") }})</span>
                <span v-else-if="isActiveStatus(selectedRun.status)" class="hint"> ({{ t("runsPolling") }})</span>
            </p>
            <p v-if="selectedRun.errorMessage" class="error">{{ selectedRun.errorMessage }}</p>

            <div v-if="selectedRun.failureLog" class="log-panel">
                <h4>{{ t("runsFailureLog") }}</h4>
                <pre>{{ selectedRun.failureLog }}</pre>
            </div>

            <h4>{{ t("runsSteps") }}</h4>
            <ul class="step-list">
                <li
                    v-for="step in selectedRun.steps ?? []"
                    :key="step.id"
                    :class="{ selected: step.id === selectedStepId }"
                >
                    <button type="button" class="step-button" @click="selectStep(step.id)">
                        {{ step.name }} - {{ step.status }}
                    </button>
                </li>
            </ul>

            <div v-if="selectedStep?.logText" class="log-panel">
                <h4>{{ t("runsStepLog") }}: {{ selectedStep.name }}</h4>
                <pre>{{ selectedStep.logText }}</pre>
            </div>
            <p v-else-if="selectedStep" class="hint">{{ t("runsStepLogEmpty") }}</p>

            <h4>{{ t("runsEvents") }}</h4>
            <ul class="event-list">
                <li v-for="event in runEvents" :key="event.id">
                    <strong>{{ event.kind }}</strong>
                    <span>{{ event.message }}</span>
                    <small>{{ event.createdAt }}</small>
                </li>
            </ul>
        </div>
    </section>
</template>
