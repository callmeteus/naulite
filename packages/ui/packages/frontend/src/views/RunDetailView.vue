<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { PipelineEvent, PipelineRun } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import MetadataGrid from "../components/ui/MetadataGrid.vue";
import MetadataGridItem from "../components/ui/MetadataGridItem.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import {
    aggregateRunHostEvents,
    filterStepLogText,
    formatRunElapsed,
    shouldCollapseStepOutput
} from "../utils/RunPresentation";
import {
    collectRunNodeIds,
    isAgentDependentRunKind,
    isActivePipelineRun,
    isRunInProgressBanner,
    shouldShowRunAgentUnreachableBanner
} from "../utils/runDetailPresentation";

enum RunDetailTab {
    DETAILS = "details",
    OUTPUT = "output",
    NODES = "nodes"
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const run = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const loading = ref(true);
const loadError = ref("");
const streamActive = ref(false);
const redeployModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const cancelModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const agentMetricsReachable = ref<boolean | null>(null);
const elapsedNowMs = ref(Date.now());
const outputSearch = ref("");
const actionError = ref<ParsedApiError | null>(null);
const actionLoading = ref(false);

let streamAbort = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let activeStreamRunId: string | null = null;

const runId = computed(() => String(route.params.id ?? ""));

const canWriteRuns = computed(() => auth.hasPermission("runs:write"));
const canApproveRuns = computed(() => auth.hasPermission("runs:approve"));

const activeTab = computed({
    get(): RunDetailTab {
        const tab = String(route.query.tab ?? RunDetailTab.DETAILS);

        if (tab === RunDetailTab.OUTPUT) {
            return RunDetailTab.OUTPUT;
        }

        if (tab === RunDetailTab.NODES) {
            return RunDetailTab.NODES;
        }

        return RunDetailTab.DETAILS;
    },

    set(tab: RunDetailTab) {
        void router.replace({
            path: route.path,
            query: {
                ...route.query,
                tab
            }
        });
    }
});

const isDeployRun = computed(() =>
    run.value?.kind === "apply" || run.value?.kind === "gitops_sync"
);

const sortedEvents = computed(() =>
    [...runEvents.value].sort((left, right) =>
        String(right.createdAt).localeCompare(String(left.createdAt))
    )
);

const hostEventRows = computed(() => {
    if (!run.value) {
        return [];
    }

    return aggregateRunHostEvents(run.value, store.nodes);
});

const showAgentUnreachableBanner = computed(() => {
    if (!run.value) {
        return false;
    }

    return shouldShowRunAgentUnreachableBanner(
        run.value,
        store.nodes,
        runEvents.value,
        { agentMetricsReachable: agentMetricsReachable.value }
    );
});

const nodesPageLink = computed(() => {
    const nodeIds = run.value ? collectRunNodeIds(run.value) : [];

    if (nodeIds.length === 1) {
        return `/nodes/${nodeIds[0]}`;
    }

    return "/nodes";
});

const isRunActive = computed(() =>
    Boolean(run.value && isActivePipelineRun(run.value.status))
);

const showInProgressBanner = computed(() =>
    Boolean(run.value && isRunInProgressBanner(run.value.status))
);

const isAwaitingApproval = computed(() => run.value?.status === "awaiting_approval");

const liveUpdateLabel = computed(() => {
    if (!isRunActive.value) {
        return "";
    }

    if (streamActive.value) {
        return t("pages.runs.streaming");
    }

    return t("pages.runs.polling");
});

const elapsedLabel = computed(() => {
    if (!run.value) {
        return "-";
    }

    const anchor = run.value.startedAt ?? run.value.createdAt;

    return formatRunElapsed(anchor, run.value.completedAt, elapsedNowMs.value);
});

const manifestOrServiceLabel = computed(() => {
    if (!run.value) {
        return "-";
    }

    return run.value.manifestName ?? run.value.serviceName ?? "-";
});

const canRelaunch = computed(() =>
    Boolean(run.value && (run.value.status === "failed" || run.value.status === "succeeded"))
);

const canRelaunchFailed = computed(() => run.value?.status === "failed");

const canCancelRun = computed(() =>
    Boolean(run.value && isActivePipelineRun(run.value.status))
);

onMounted(() => {
    void loadRun();
    elapsedTimer = setInterval(() => {
        elapsedNowMs.value = Date.now();
    }, 1000);
});

onBeforeUnmount(() => {
    stopLiveUpdates();

    if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
    }
});

watch(runId, () => {
    void loadRun();
});

watch(
    () => (run.value ? { id: run.value.id, status: run.value.status } : null),
    (snapshot) => {
        if (!snapshot) {
            stopLiveUpdates();
            return;
        }

        if (isActivePipelineRun(snapshot.status)) {
            void startLiveUpdates(snapshot.id);
        } else {
            stopLiveUpdates();
        }
    }
);

/**
 * Returns a localized label for a pipeline run kind.
 *
 * @param kind Pipeline run kind
 * @returns Localized label
 */
function kindLabel(kind: string): string {
    const key = `pages.runs.kinds.${kind}`;

    return t(key) === key ? kind : t(key);
}

/**
 * Formats an ISO timestamp for display.
 *
 * @param value ISO timestamp
 * @returns Localized date/time string
 */
function formatTimestamp(value?: string | null): string {
    if (!value) {
        return "-";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

/**
 * Returns filtered log text for a step in the output tab.
 *
 * @param logText Raw step log
 * @returns Filtered log text
 */
function displayStepLog(logText: string): string {
    return filterStepLogText(logText, outputSearch.value);
}

/**
 * Loads run detail and events.
 *
 * @returns Nothing.
 */
async function loadRun(): Promise<void> {
    loading.value = true;
    loadError.value = "";
    stopLiveUpdates();

    try {
        await store.refreshOverview({ silent: true });
        run.value = await store.getRun(runId.value);
        runEvents.value = await store.getRunEvents(runId.value);
        await refreshAgentReachability();
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : String(err);
        run.value = null;
        runEvents.value = [];
        agentMetricsReachable.value = null;
    } finally {
        loading.value = false;
    }
}

/**
 * Refreshes run detail from the API.
 *
 * @returns Nothing.
 */
async function refreshRun(): Promise<void> {
    if (!runId.value) {
        return;
    }

    run.value = await store.getRun(runId.value);
    runEvents.value = await store.getRunEvents(runId.value);
    await refreshAgentReachability();
}

/**
 * Probes whether Prometheus can scrape at least one node agent.
 *
 * @returns Nothing.
 */
async function refreshAgentReachability(): Promise<void> {
    if (!run.value || !isAgentDependentRunKind(run.value.kind) || store.nodes.length === 0) {
        agentMetricsReachable.value = null;
        return;
    }

    try {
        const agentUp = await nauliteClient.queryMetrics("naulite_agent_up");
        agentMetricsReachable.value = (agentUp.data?.result?.length ?? 0) > 0;
    } catch {
        agentMetricsReachable.value = null;
    }
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
 * Returns whether the run reached a terminal status.
 *
 * @param status Pipeline run status
 * @returns True when streaming and polling should stop
 */
function isTerminalRunStatus(status: PipelineRun["status"]): boolean {
    return status === "succeeded" || status === "failed";
}

/**
 * Starts polling as a fallback when SSE is unavailable.
 *
 * @param _runId Pipeline run identifier (reserved for future scoped polling)
 * @returns Nothing.
 */
function startPolling(_runId: string): void {
    if (pollTimer) {
        return;
    }

    pollTimer = setInterval(() => {
        void refreshRun().then(() => {
            const status = run.value?.status;

            if (status && isTerminalRunStatus(status)) {
                stopLiveUpdates();
            }
        });
    }, 3000);
}

/**
 * Streams pipeline events over SSE and refreshes run detail.
 *
 * @param id Pipeline run identifier
 * @returns Nothing.
 */
async function startLiveUpdates(id: string): Promise<void> {
    if (activeStreamRunId === id && (streamActive.value || pollTimer)) {
        return;
    }

    stopLiveUpdates();
    activeStreamRunId = id;
    streamAbort = false;
    streamActive.value = true;

    try {
        for await (const event of nauliteClient.streamRunEvents(id)) {
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
                await refreshRun();
            }
        }

        await refreshRun();
    } catch {
        if (!streamAbort) {
            startPolling(id);
        }
    } finally {
        streamActive.value = false;
    }
}

/**
 * Re-triggers a failed CI build run.
 *
 * @returns Nothing.
 */
async function rerunBuild(): Promise<void> {
    if (!run.value?.serviceName) {
        return;
    }

    const result = await store.triggerBuild({ serviceName: run.value.serviceName });

    if (result.runId) {
        await router.push(`/runs/${result.runId}`);
        return;
    }

    await router.push("/runs/build");
}

/**
 * Opens the re-deploy confirmation modal.
 *
 * @returns Nothing.
 */
function requestRedeploy(): void {
    redeployModalRef.value?.open();
}

/**
 * Navigates to deploy so the operator can re-apply the manifest.
 *
 * @returns Nothing.
 */
async function confirmRedeploy(): Promise<void> {
    await router.push("/runs/deploy");
}

/**
 * Continues a gated pipeline run after operator approval.
 *
 * @returns Nothing.
 */
async function continueGatedRun(): Promise<void> {
    if (!run.value) {
        return;
    }

    actionLoading.value = true;
    actionError.value = null;

    try {
        await nauliteClient.continuePipelineRun(run.value.id);
        await refreshRun();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        actionLoading.value = false;
    }
}

/**
 * Aborts the current pipeline run.
 *
 * @returns Nothing.
 */
async function abortRun(): Promise<void> {
    if (!run.value) {
        return;
    }

    actionLoading.value = true;
    actionError.value = null;

    try {
        await nauliteClient.abortPipelineRun(run.value.id);
        await refreshRun();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        actionLoading.value = false;
    }
}

/**
 * Opens the cancel confirmation modal.
 *
 * @returns Nothing.
 */
function requestCancelRun(): void {
    cancelModalRef.value?.open();
}

/**
 * Relaunches the pipeline run.
 *
 * @param failedOnly When true, only failed steps are retried
 * @returns Nothing.
 */
async function relaunchRun(failedOnly = false): Promise<void> {
    if (!run.value) {
        return;
    }

    actionLoading.value = true;
    actionError.value = null;

    try {
        const result = await nauliteClient.relaunchPipelineRun(run.value.id, { failedOnly });
        await router.push(`/runs/${result.id}`);
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        actionLoading.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.runs.detailTitle" hint-key="pages.runs.detailHint">
        <template #actions>
            <RouterLink to="/delivery/pipeline" class="btn btn-ghost btn-sm">
                {{ t("pages.runs.backToList") }}
            </RouterLink>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="loading"
                @click="refreshRun"
            >
                {{ t("pages.runs.refresh") }}
            </button>
        </template>

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <ErrorAlert v-else-if="loadError" :error="loadError" />

        <template v-else-if="run">
            <ErrorAlert :error="actionError" />

            <div
                v-if="showAgentUnreachableBanner"
                class="alert border-warning/30 bg-warning/10 text-sm"
            >
                <div class="flex w-full flex-wrap items-center justify-between gap-3">
                    <span>{{ t("pages.runs.agentUnreachableDescription") }}</span>
                    <RouterLink :to="nodesPageLink" class="btn btn-ghost btn-sm">
                        {{ t("pages.runs.viewNodes") }}
                    </RouterLink>
                </div>
            </div>

            <div
                v-if="isAwaitingApproval"
                class="alert border-warning/30 bg-warning/10 text-sm"
            >
                <div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p class="font-medium">{{ t("pages.runs.gateTitle") }}</p>
                        <p class="text-base-content/70">{{ t("pages.runs.gateHint") }}</p>
                    </div>
                    <div v-if="canApproveRuns" class="flex flex-wrap gap-2">
                        <button
                            type="button"
                            class="btn btn-primary btn-sm"
                            :disabled="actionLoading"
                            @click="continueGatedRun"
                        >
                            {{ t("pages.runs.gateConfirm") }}
                        </button>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="actionLoading"
                            @click="abortRun"
                        >
                            {{ t("pages.runs.gateReject") }}
                        </button>
                    </div>
                </div>
            </div>

            <div
                v-if="showInProgressBanner"
                class="alert border-primary/30 bg-primary/10 text-sm"
            >
                <span class="loading loading-spinner loading-sm shrink-0 text-primary" />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                    <p class="font-medium">
                        {{ t("pages.runs.inProgressTitle") }}
                    </p>
                    <p class="text-base-content/70">
                        {{ t("pages.runs.inProgressHint") }}
                    </p>
                    <p v-if="liveUpdateLabel" class="text-xs text-base-content/60">
                        {{ liveUpdateLabel }}
                    </p>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <progress
                    v-if="showInProgressBanner"
                    class="progress progress-primary h-1 w-full rounded-none"
                />
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                            <p class="font-mono text-sm text-base-content/60">
                                {{ run.id }}
                            </p>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                    v-if="showInProgressBanner"
                                    class="loading loading-spinner loading-sm text-primary"
                                    aria-hidden="true"
                                />
                                <StatusPill :status="run.status" size="md" />
                                <span class="badge badge-outline">
                                    {{ kindLabel(run.kind) }}
                                </span>
                                <span class="badge badge-ghost">
                                    {{ t("pages.runs.elapsed") }}: {{ elapsedLabel }}
                                </span>
                            </div>
                            <p class="mt-2 text-sm text-base-content/70">
                                {{ t("pages.runs.launchedBy") }}:
                                <span class="font-medium text-base-content">{{ run.createdBy ?? "-" }}</span>
                            </p>
                            <p class="text-sm text-base-content/70">
                                {{ t("common.tableColumns.manifest") }}:
                                <span class="font-medium text-base-content">{{ manifestOrServiceLabel }}</span>
                            </p>
                        </div>

                        <div class="flex flex-wrap gap-2">
                            <button
                                v-if="run.kind === 'ci_build' && run.status === 'failed' && run.serviceName"
                                type="button"
                                class="btn btn-primary btn-sm"
                                :disabled="store.loading"
                                @click="rerunBuild"
                            >
                                {{ t("pages.runs.rerunBuild") }}
                            </button>
                            <button
                                v-if="isDeployRun && run.status === 'failed'"
                                type="button"
                                class="btn btn-primary btn-sm"
                                @click="requestRedeploy"
                            >
                                {{ t("pages.runs.redeploy") }}
                            </button>
                            <button
                                v-if="canWriteRuns && canRelaunch"
                                type="button"
                                class="btn btn-outline btn-sm"
                                :disabled="actionLoading"
                                @click="relaunchRun(false)"
                            >
                                {{ t("pages.runs.relaunch") }}
                            </button>
                            <button
                                v-if="canWriteRuns && canRelaunchFailed"
                                type="button"
                                class="btn btn-outline btn-sm"
                                :disabled="actionLoading"
                                @click="relaunchRun(true)"
                            >
                                {{ t("pages.runs.relaunchFailed") }}
                            </button>
                            <button
                                v-if="canWriteRuns && canCancelRun"
                                type="button"
                                class="btn btn-error btn-outline btn-sm"
                                :disabled="actionLoading"
                                @click="requestCancelRun"
                            >
                                {{ t("pages.runs.cancelRun") }}
                            </button>
                        </div>
                    </div>

                    <div class="tabs tabs-boxed w-fit">
                        <button
                            type="button"
                            class="tab"
                            :class="{ 'tab-active': activeTab === RunDetailTab.DETAILS }"
                            @click="activeTab = RunDetailTab.DETAILS"
                        >
                            {{ t("pages.runs.tabs.details") }}
                        </button>
                        <button
                            type="button"
                            class="tab"
                            :class="{ 'tab-active': activeTab === RunDetailTab.OUTPUT }"
                            @click="activeTab = RunDetailTab.OUTPUT"
                        >
                            {{ t("pages.runs.tabs.output") }}
                        </button>
                        <button
                            type="button"
                            class="tab"
                            :class="{ 'tab-active': activeTab === RunDetailTab.NODES }"
                            @click="activeTab = RunDetailTab.NODES"
                        >
                            {{ t("pages.runs.tabs.nodes") }}
                        </button>
                    </div>

                    <ErrorAlert :error="run.errorMessage ?? null" />
                </div>
            </div>

            <div v-if="activeTab === RunDetailTab.DETAILS" class="space-y-6">
                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <MetadataGrid :columns="2" density="compact">
                            <MetadataGridItem
                                :label="t('common.tableColumns.service')"
                                :value="run.serviceName"
                            />
                            <MetadataGridItem
                                :label="t('common.tableColumns.manifest')"
                                :value="run.manifestName"
                            />
                            <MetadataGridItem
                                :label="t('common.tableColumns.started')"
                                :value="formatTimestamp(run.startedAt ?? run.createdAt)"
                            />
                            <MetadataGridItem
                                :label="t('pages.runs.launchedBy')"
                                :value="run.createdBy"
                            />
                        </MetadataGrid>
                    </div>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <h2 class="text-base font-semibold">
                            {{ t("pages.runs.events") }}
                        </h2>

                        <p v-if="sortedEvents.length === 0" class="text-sm text-base-content/70">
                            {{ t("pages.runs.eventsEmpty") }}
                        </p>

                        <ol v-else class="space-y-3">
                            <li
                                v-for="event in sortedEvents"
                                :key="event.id"
                                class="rounded-lg border border-base-300 px-4 py-3"
                            >
                                <p class="text-sm">
                                    {{ event.message }}
                                </p>
                                <p class="mt-1 text-xs text-base-content/60">
                                    {{ formatTimestamp(event.createdAt) }}
                                </p>
                            </li>
                        </ol>
                    </div>
                </div>

                <div v-if="run.failureLog" class="card bg-base-100 shadow">
                    <div class="card-body gap-3">
                        <h2 class="text-base font-semibold">
                            {{ t("pages.runs.failureLog") }}
                        </h2>
                        <pre class="max-h-72 overflow-auto rounded-lg bg-base-300 p-4 text-xs">{{ run.failureLog }}</pre>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === RunDetailTab.OUTPUT" class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-end justify-between gap-3">
                        <h2 class="text-base font-semibold">
                            {{ t("pages.runs.tabs.output") }}
                        </h2>
                        <label class="form-control w-full max-w-sm">
                            <span class="label-text">{{ t("pages.runs.outputSearch") }}</span>
                            <input
                                v-model="outputSearch"
                                type="search"
                                class="input input-bordered input-sm w-full"
                                :placeholder="t('pages.runs.outputSearchPlaceholder')"
                            />
                        </label>
                    </div>

                    <p v-if="!run.steps || run.steps.length === 0" class="text-sm text-base-content/70">
                        {{ t("pages.runs.stepLogEmpty") }}
                    </p>

                    <div v-else class="flex flex-col gap-3">
                        <details
                            v-for="step in run.steps"
                            :key="step.id"
                            class="rounded-lg border border-base-300 p-3"
                            :open="!shouldCollapseStepOutput(step)"
                        >
                            <summary class="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-medium">
                                <span>{{ step.name }}</span>
                                <StatusPill :status="step.status" />
                            </summary>
                            <pre
                                v-if="step.logText"
                                class="mt-3 max-h-72 overflow-auto rounded-lg bg-base-300 p-4 text-xs"
                            >{{ displayStepLog(step.logText) }}</pre>
                            <p v-else class="mt-3 text-sm text-base-content/70">
                                {{ t("pages.runs.stepLogEmpty") }}
                            </p>
                        </details>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === RunDetailTab.NODES" class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <h2 class="text-base font-semibold">
                        {{ t("pages.runs.tabs.nodes") }}
                    </h2>

                    <p v-if="hostEventRows.length === 0" class="text-sm text-base-content/70">
                        {{ t("pages.runs.nodesEmpty") }}
                    </p>

                    <div v-else class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.tableColumns.hostname") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("pages.runs.nodeStepCount") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="row in hostEventRows" :key="row.nodeId">
                                    <td>
                                        <RouterLink
                                            :to="`/nodes/${row.nodeId}`"
                                            class="link link-hover"
                                        >
                                            {{ row.hostname }}
                                        </RouterLink>
                                    </td>
                                    <td><StatusPill :status="row.status" /></td>
                                    <td>{{ row.stepCount }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </template>

        <ConfirmModal
            ref="redeployModalRef"
            title-key="pages.runs.redeploy"
            message-key="pages.runs.redeployConfirm"
            confirm-label-key="pages.runs.redeploy"
            @confirm="confirmRedeploy"
        />
        <ConfirmModal
            ref="cancelModalRef"
            title-key="pages.runs.cancelRun"
            message-key="pages.runs.cancelRunConfirm"
            confirm-label-key="pages.runs.cancelRun"
            @confirm="abortRun"
        />
    </PageLayout>
</template>
