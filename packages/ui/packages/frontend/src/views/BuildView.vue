<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { PipelineEvent, PipelineRun } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const serviceName = ref("");
const provider = ref("");
const registry = ref("");
const activeRunId = ref("");
const activeRun = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const selectedStepId = ref<string | null>(null);
const buildMessage = ref("");
const streamActive = ref(false);
let streamAbort = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

const selectedStep = computed(() => {
    if (!activeRun.value?.steps || !selectedStepId.value) {
        return null;
    }

    return activeRun.value.steps.find((step) => step.id === selectedStepId.value) ?? null;
});

onMounted(() => {
    void store.refreshOverview();
});

onBeforeUnmount(() => {
    stopLiveUpdates();
});

watch(
    () => (activeRun.value ? [activeRun.value.id, activeRun.value.status] : null),
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
 * Stops SSE streaming and polling timers.
 *
 * @returns Nothing.
 */
function stopLiveUpdates(): void {
    streamAbort = true;
    streamActive.value = false;

    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
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
        void store.getRun(runId).then((run) => {
            activeRun.value = run;

            if (run.status === "succeeded" || run.status === "failed") {
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
    stopLiveUpdates();
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
                activeRun.value = await store.getRun(runId);
                selectedStepId.value = activeRun.value.steps?.[0]?.id ?? null;
            }
        }

        activeRun.value = await store.getRun(runId);
    } catch {
        if (!streamAbort) {
            startPolling(runId);
        }
    } finally {
        streamActive.value = false;
    }
}

/**
 * Triggers a service image build and tracks the resulting pipeline run.
 *
 * @returns Nothing.
 */
async function triggerBuild(): Promise<void> {
    const trimmedService = serviceName.value.trim();

    if (!trimmedService) {
        return;
    }

    buildMessage.value = "";
    activeRun.value = null;
    activeRunId.value = "";
    runEvents.value = [];
    selectedStepId.value = null;

    const result = await store.triggerBuild({
        serviceName: trimmedService,
        provider: provider.value.trim() || undefined,
        registry: registry.value.trim() || undefined
    });

    if (result.runId) {
        activeRunId.value = result.runId;
        activeRun.value = await store.getRun(result.runId);
        selectedStepId.value = activeRun.value.steps?.[0]?.id ?? null;
        buildMessage.value = t("pages.build.started");
        return;
    }

    buildMessage.value = t("pages.build.queued");
}
</script>

<template>
    <PageLayout title-key="pages.build.title" hint-key="pages.build.hint">
        <ErrorAlert :error="store.error" />

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <form class="grid gap-4 md:grid-cols-2" @submit.prevent="triggerBuild">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.build.serviceName") }}</span>
                        <input
                            v-model="serviceName"
                            type="text"
                            class="input input-bordered w-full"
                            list="service-names"
                            :placeholder="t('pages.build.servicePlaceholder')"
                        />
                        <datalist id="service-names">
                            <option v-for="service in store.services" :key="service.name" :value="service.name" />
                        </datalist>
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.build.provider") }}</span>
                        <input
                            v-model="provider"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.build.providerPlaceholder')"
                        />
                    </label>
                    <label class="form-control w-full md:col-span-2">
                        <span class="label-text">{{ t("pages.build.registry") }}</span>
                        <input
                            v-model="registry"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.build.registryPlaceholder')"
                        />
                    </label>
                    <div class="md:col-span-2">
                        <button type="submit" class="btn btn-primary" :disabled="store.loading || !serviceName.trim()">
                            {{ t("pages.build.trigger") }}
                        </button>
                    </div>
                </form>

                <p v-if="buildMessage" class="text-sm text-base-content/70">
                    {{ buildMessage }}
                </p>

                <div v-if="activeRun" class="grid gap-6 lg:grid-cols-2">
                    <div class="space-y-4">
                        <p>
                            {{ t("pages.runs.statusFilter") }}:
                            <StatusPill :status="activeRun.status" size="md" />
                            <span v-if="streamActive" class="ml-2 text-sm text-base-content/70">
                                ({{ t("pages.runs.streaming") }})
                            </span>
                        </p>
                        <p v-if="activeRun.imageRef">
                            <span class="font-medium">{{ t("common.tableColumns.image") }}:</span>
                            <code class="text-xs">{{ activeRun.imageRef }}</code>
                        </p>
                        <ErrorAlert :error="activeRun.errorMessage ?? null" />

                        <div v-if="activeRun.failureLog" class="rounded-box bg-base-300 p-4">
                            <h4 class="font-semibold">
                                {{ t("pages.runs.failureLog") }}
                            </h4>
                            <pre class="mt-2 max-h-64 overflow-auto text-xs">{{ activeRun.failureLog }}</pre>
                        </div>

                        <div>
                            <h4 class="font-semibold">
                                {{ t("pages.runs.steps") }}
                            </h4>
                            <ul class="mt-2 flex flex-wrap gap-2">
                                <li v-for="step in activeRun.steps ?? []" :key="step.id">
                                    <button
                                        type="button"
                                        class="btn btn-sm inline-flex items-center gap-2"
                                        :class="step.id === selectedStepId ? 'btn-primary' : 'btn-outline'"
                                        @click="selectedStepId = step.id"
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
                    </div>

                    <div v-if="activeRunId" class="space-y-4">
                        <router-link
                            class="link link-primary"
                            :to="{ path: '/runs', query: { id: activeRunId } }"
                        >
                            {{ t("pages.deploy.runLink") }}: {{ activeRunId }}
                        </router-link>

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
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
