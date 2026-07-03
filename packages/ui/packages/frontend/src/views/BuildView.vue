<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

import type { PipelineEvent, PipelineRun } from "@platform/sdk";
import { platformClient } from "../api/Client";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

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
        for await (const event of platformClient.streamRunEvents(runId)) {
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
        buildMessage.value = t("buildStarted");
        return;
    }

    buildMessage.value = t("buildQueued");
}
</script>

<template>
    <section>
        <h2>{{ t("build") }}</h2>
        <p class="hint">{{ t("buildHint") }}</p>
        <p v-if="store.error" class="error">{{ store.error }}</p>

        <div class="panel">
            <form class="create-form" @submit.prevent="triggerBuild">
                <label>
                    {{ t("buildServiceName") }}
                    <input
                        v-model="serviceName"
                        type="text"
                        list="service-names"
                        :placeholder="t('buildServicePlaceholder')"
                    />
                    <datalist id="service-names">
                        <option v-for="service in store.services" :key="service.name" :value="service.name" />
                    </datalist>
                </label>
                <label>
                    {{ t("buildProvider") }}
                    <input v-model="provider" type="text" :placeholder="t('buildProviderPlaceholder')" />
                </label>
                <label>
                    {{ t("buildRegistry") }}
                    <input v-model="registry" type="text" :placeholder="t('buildRegistryPlaceholder')" />
                </label>
                <button type="submit" :disabled="store.loading || !serviceName.trim()">
                    {{ t("buildTrigger") }}
                </button>
            </form>

            <p v-if="buildMessage" class="hint">{{ buildMessage }}</p>

            <div v-if="activeRun" class="panel-grid">
                <div>
                    <p>
                        {{ t("runsStatusFilter") }}: {{ activeRun.status }}
                        <span v-if="streamActive" class="hint"> ({{ t("runsStreaming") }})</span>
                    </p>
                    <p v-if="activeRun.imageRef">image: {{ activeRun.imageRef }}</p>
                    <p v-if="activeRun.errorMessage" class="error">{{ activeRun.errorMessage }}</p>
                    <div v-if="activeRun.failureLog" class="log-panel">
                        <h4>{{ t("runsFailureLog") }}</h4>
                        <pre>{{ activeRun.failureLog }}</pre>
                    </div>

                    <h4>{{ t("runsSteps") }}</h4>
                    <ul class="step-list">
                        <li
                            v-for="step in activeRun.steps ?? []"
                            :key="step.id"
                            :class="{ selected: step.id === selectedStepId }"
                        >
                            <button type="button" class="step-button" @click="selectedStepId = step.id">
                                {{ step.name }} - {{ step.status }}
                            </button>
                        </li>
                    </ul>

                    <div v-if="selectedStep?.logText" class="log-panel">
                        <h4>{{ t("runsStepLog") }}: {{ selectedStep.name }}</h4>
                        <pre>{{ selectedStep.logText }}</pre>
                    </div>
                </div>
                <div v-if="activeRunId">
                    <router-link :to="{ path: '/runs', query: { id: activeRunId } }">
                        {{ t("deployRunLink") }}: {{ activeRunId }}
                    </router-link>

                    <h4>{{ t("runsEvents") }}</h4>
                    <ul class="event-list">
                        <li v-for="event in runEvents" :key="event.id">
                            <strong>{{ event.kind }}</strong>
                            <span>{{ event.message }}</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    </section>
</template>
