<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";

import type { ListPipelineRunsQuery, PipelineEvent, PipelineRun, PipelineRunKind, PipelineRunStatus } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useServerPagination } from "../composables/useServerPagination";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const route = useRoute();
const router = useRouter();
const selectedRun = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const selectedStepId = ref<string | null>(null);
const kindFilter = ref<PipelineRunKind | "">("");
const statusFilter = ref<PipelineRunStatus | "">("");
const streamActive = ref(false);
const actionMessage = ref("");
const redeployModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const pendingRedeployRun = ref<PipelineRun | null>(null);
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

const listErrorMessage = computed(() => store.error || listError.value || null);

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

/**
 * Re-triggers a failed CI build run.
 *
 * @param run Failed pipeline run
 * @returns Nothing.
 */
async function rerunBuild(run: PipelineRun): Promise<void> {
    if (!run.serviceName) {
        return;
    }

    actionMessage.value = "";
    await store.triggerBuild({ serviceName: run.serviceName });
    actionMessage.value = t("pages.runs.rerunBuildSuccess");
    await refreshList();
}

/**
 * Opens the re-deploy confirmation modal for a failed apply run.
 *
 * @param run Failed pipeline run
 * @returns Nothing.
 */
function requestRedeploy(run: PipelineRun): void {
    pendingRedeployRun.value = run;
    redeployModalRef.value?.open();
}

/**
 * Navigates to deploy so the operator can re-apply the manifest.
 *
 * @returns Nothing.
 */
async function confirmRedeploy(): Promise<void> {
    actionMessage.value = t("pages.runs.redeploySuccess");
    pendingRedeployRun.value = null;
    await router.push("/deploy");
}
</script>

<template>
    <PageLayout title-key="pages.runs.title" hint-key="pages.runs.hint">
        <template #filters>
            <label class="form-control w-full max-w-xs">
                <span class="label-text">{{ t("pages.runs.kindFilter") }}</span>
                <select v-model="kindFilter" class="select select-bordered">
                    <option value="">{{ t("pages.runs.filterAll") }}</option>
                    <option value="ci_build">ci_build</option>
                    <option value="apply">apply</option>
                    <option value="gitops_sync">gitops_sync</option>
                    <option value="node_event">node_event</option>
                </select>
            </label>
            <label class="form-control w-full max-w-xs">
                <span class="label-text">{{ t("pages.runs.statusFilter") }}</span>
                <select v-model="statusFilter" class="select select-bordered">
                    <option value="">{{ t("pages.runs.filterAll") }}</option>
                    <option value="pending">pending</option>
                    <option value="running">running</option>
                    <option value="succeeded">succeeded</option>
                    <option value="failed">failed</option>
                </select>
            </label>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="listLoading"
                @click="refreshList"
            >
                {{ t("pages.runs.refresh") }}
            </button>
        </template>

        <ErrorAlert :error="listErrorMessage" />

        <p v-if="actionMessage" class="alert alert-success">
            {{ actionMessage }}
        </p>

        <div v-if="listLoading && paginatedRuns.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!listError && paginatedRuns.length === 0"
            title-key="pages.runs.emptyTitle"
            description-key="pages.runs.emptyDescription"
            action-label-key="pages.runs.emptyAction"
            action-to="/build"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.id") }}</th>
                            <th>{{ t("common.tableColumns.kind") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.service") }}</th>
                            <th>{{ t("common.tableColumns.started") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="run in paginatedRuns" :key="run.id">
                            <td>{{ run.id }}</td>
                            <td>{{ run.kind }}</td>
                            <td><StatusPill :status="run.status" /></td>
                            <td>{{ run.serviceName ?? "-" }}</td>
                            <td>{{ run.startedAt ?? run.createdAt }}</td>
                            <td class="flex flex-wrap gap-2">
                                <button type="button" class="btn btn-outline btn-sm" @click="loadRunDetail(run.id)">
                                    {{ t("pages.runs.viewDetails") }}
                                </button>
                                <button
                                    v-if="run.kind === 'ci_build' && run.status === 'failed' && run.serviceName"
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    :disabled="store.loading"
                                    @click="rerunBuild(run)"
                                >
                                    {{ t("pages.runs.rerunBuild") }}
                                </button>
                                <button
                                    v-if="run.kind === 'apply' && run.status === 'failed'"
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    @click="requestRedeploy(run)"
                                >
                                    {{ t("pages.runs.redeploy") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div v-if="paginatedRuns.length > 0" class="mt-4 flex items-center justify-end gap-2">
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

        <div v-if="selectedRun" class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <h3 class="text-lg font-semibold">
                        {{ t("pages.runs.detailTitle") }}: {{ selectedRun.id }}
                    </h3>
                    <button type="button" class="btn btn-outline btn-sm" @click="clearSelection">
                        {{ t("pages.runs.closeDetail") }}
                    </button>
                </div>

                <p>
                    {{ t("pages.runs.statusFilter") }}:
                    <StatusPill class="ml-2" :status="selectedRun.status" size="md" />
                    <span v-if="streamActive" class="ml-2 text-sm text-base-content/70">
                        ({{ t("pages.runs.streaming") }})
                    </span>
                    <span v-else-if="isActiveStatus(selectedRun.status)" class="ml-2 text-sm text-base-content/70">
                        ({{ t("pages.runs.polling") }})
                    </span>
                </p>

                <div class="flex flex-wrap gap-2">
                    <button
                        v-if="selectedRun.kind === 'ci_build' && selectedRun.status === 'failed' && selectedRun.serviceName"
                        type="button"
                        class="btn btn-primary btn-sm"
                        :disabled="store.loading"
                        @click="rerunBuild(selectedRun)"
                    >
                        {{ t("pages.runs.rerunBuild") }}
                    </button>
                    <button
                        v-if="selectedRun.kind === 'apply' && selectedRun.status === 'failed'"
                        type="button"
                        class="btn btn-primary btn-sm"
                        @click="requestRedeploy(selectedRun)"
                    >
                        {{ t("pages.runs.redeploy") }}
                    </button>
                </div>

                <ErrorAlert :error="selectedRun.errorMessage ?? null" />

                <div v-if="selectedRun.failureLog" class="rounded-box bg-base-300 p-4">
                    <h4 class="font-semibold">
                        {{ t("pages.runs.failureLog") }}
                    </h4>
                    <pre class="mt-2 max-h-64 overflow-auto text-xs">{{ selectedRun.failureLog }}</pre>
                </div>

                <div>
                    <h4 class="font-semibold">
                        {{ t("pages.runs.steps") }}
                    </h4>
                    <ul class="mt-2 flex flex-wrap gap-2">
                        <li v-for="step in selectedRun.steps ?? []" :key="step.id">
                            <button
                                type="button"
                                class="btn btn-sm inline-flex items-center gap-2"
                                :class="step.id === selectedStepId ? 'btn-primary' : 'btn-outline'"
                                @click="selectStep(step.id)"
                            >
                                <span>{{ step.name }}</span>
                                <StatusPill :status="step.status" />
                            </button>
                        </li>
                    </ul>
                </div>

                <div v-if="selectedStep?.logText" class="rounded-box bg-base-300 p-4">
                    <h4 class="font-semibold">
                        {{ t("pages.runs.stepLog") }}: {{ selectedStep.name }}
                    </h4>
                    <pre class="mt-2 max-h-64 overflow-auto text-xs">{{ selectedStep.logText }}</pre>
                </div>
                <p v-else-if="selectedStep" class="text-sm text-base-content/70">
                    {{ t("pages.runs.stepLogEmpty") }}
                </p>

                <div>
                    <h4 class="font-semibold">
                        {{ t("pages.runs.events") }}
                    </h4>
                    <ul class="mt-2 space-y-2">
                        <li
                            v-for="event in runEvents"
                            :key="event.id"
                            class="rounded-box border border-base-300 p-3 text-sm"
                        >
                            <strong>{{ event.kind }}</strong>
                            <span class="ml-2">{{ event.message }}</span>
                            <small class="mt-1 block text-base-content/60">{{ event.createdAt }}</small>
                        </li>
                    </ul>
                </div>
            </div>
        </div>

        <ConfirmModal
            ref="redeployModalRef"
            title-key="pages.runs.redeploy"
            message-key="pages.runs.redeployConfirm"
            confirm-label-key="pages.runs.redeploy"
            @confirm="confirmRedeploy"
        />
    </PageLayout>
</template>
