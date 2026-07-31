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
import StatusPill from "../components/ui/StatusPill.vue";
import { useClusterStore } from "../stores/Cluster";
import {
    collectRunNodeIds,
    isAgentDependentRunKind,
    shouldShowRunAgentUnreachableBanner
} from "../utils/runDetailPresentation";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useClusterStore();

const run = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const selectedStepId = ref<string | null>(null);
const loading = ref(true);
const loadError = ref("");
const streamActive = ref(false);
const redeployModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const agentMetricsReachable = ref<boolean | null>(null);

let streamAbort = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let activeStreamRunId: string | null = null;

const runId = computed(() => String(route.params.id ?? ""));

const selectedStep = computed(() => {
    if (!run.value?.steps || !selectedStepId.value) {
        return null;
    }

    return run.value.steps.find((step) => step.id === selectedStepId.value) ?? null;
});

const isDeployRun = computed(() =>
    run.value?.kind === "apply" || run.value?.kind === "gitops_sync"
);

const sortedEvents = computed(() =>
    [...runEvents.value].sort((left, right) =>
        String(right.createdAt).localeCompare(String(left.createdAt))
    )
);

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
    Boolean(run.value && isActiveStatus(run.value.status))
);

const liveUpdateLabel = computed(() => {
    if (!isRunActive.value) {
        return "";
    }

    if (streamActive.value) {
        return t("pages.runs.streaming");
    }

    return t("pages.runs.polling");
});

onMounted(() => {
    void loadRun();
});

onBeforeUnmount(() => {
    stopLiveUpdates();
});

watch(runId, () => {
    void loadRun();
});

watch(
    () => (run.value ? [run.value.id, run.value.status] : null),
    (key) => {
        if (!key) {
            stopLiveUpdates();
            return;
        }

        const [id, status] = key;

        if (status === "pending" || status === "running") {
            void startLiveUpdates(id);
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
        selectedStepId.value = run.value.steps?.[0]?.id ?? null;
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

    if (
        selectedStepId.value &&
        !run.value.steps?.some((step) => step.id === selectedStepId.value)
    ) {
        selectedStepId.value = run.value.steps?.[0]?.id ?? null;
    }
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
 * Starts polling as a fallback when SSE is unavailable.
 *
 * @param id Pipeline run identifier
 * @returns Nothing.
 */
function startPolling(id: string): void {
    if (pollTimer) {
        return;
    }

    pollTimer = setInterval(() => {
        void refreshRun().then(() => {
            const status = run.value?.status;

            if (status === "succeeded" || status === "failed") {
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

    await router.push("/runs?build=open");
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
    await router.push("/runs?deploy=open");
}
</script>

<template>
    <PageLayout title-key="pages.runs.detailTitle" hint-key="pages.runs.detailHint">
        <template #actions>
            <RouterLink to="/runs" class="btn btn-ghost btn-sm">
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
                v-if="isRunActive"
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
                    v-if="isRunActive"
                    class="progress progress-primary h-1 w-full rounded-none"
                />
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <p class="font-mono text-sm text-base-content/60">
                                {{ run.id }}
                            </p>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                                <span
                                    v-if="isRunActive"
                                    class="loading loading-spinner loading-sm text-primary"
                                    aria-hidden="true"
                                />
                                <StatusPill :status="run.status" size="md" />
                                <span class="badge badge-outline">
                                    {{ kindLabel(run.kind) }}
                                </span>
                            </div>
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
                        </div>
                    </div>

                    <dl class="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                            <dt class="text-base-content/60">
                                {{ t("common.tableColumns.service") }}
                            </dt>
                            <dd class="font-medium">
                                {{ run.serviceName ?? "-" }}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-base-content/60">
                                {{ t("common.tableColumns.started") }}
                            </dt>
                            <dd class="font-medium">
                                {{ formatTimestamp(run.startedAt ?? run.createdAt) }}
                            </dd>
                        </div>
                    </dl>

                    <ErrorAlert :error="run.errorMessage ?? null" />
                </div>
            </div>

            <div
                v-if="run.steps && run.steps.length > 0"
                class="card bg-base-100 shadow"
            >
                <div class="card-body gap-4">
                    <h2 class="text-base font-semibold">
                        {{ t("pages.runs.steps") }}
                    </h2>

                    <div class="flex flex-wrap gap-2">
                        <button
                            v-for="step in run.steps"
                            :key="step.id"
                            type="button"
                            class="btn btn-sm inline-flex items-center gap-2"
                            :class="step.id === selectedStepId ? 'btn-primary' : 'btn-outline'"
                            @click="selectStep(step.id)"
                        >
                            <span>{{ step.name }}</span>
                            <StatusPill :status="step.status" />
                        </button>
                    </div>

                    <div v-if="selectedStep?.logText" class="rounded-lg bg-base-300 p-4">
                        <p class="text-sm font-medium">
                            {{ t("pages.runs.stepLog") }}: {{ selectedStep.name }}
                        </p>
                        <pre class="mt-2 max-h-72 overflow-auto text-xs">{{ selectedStep.logText }}</pre>
                    </div>
                    <p v-else-if="selectedStep" class="text-sm text-base-content/70">
                        {{ t("pages.runs.stepLogEmpty") }}
                    </p>
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
        </template>

        <ConfirmModal
            ref="redeployModalRef"
            title-key="pages.runs.redeploy"
            message-key="pages.runs.redeployConfirm"
            confirm-label-key="pages.runs.redeploy"
            @confirm="confirmRedeploy"
        />
    </PageLayout>
</template>
