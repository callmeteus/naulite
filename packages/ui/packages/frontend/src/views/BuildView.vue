<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

import type { PipelineRun } from "@platform/sdk";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const serviceName = ref("");
const provider = ref("");
const registry = ref("");
const activeRunId = ref("");
const activeRun = ref<PipelineRun | null>(null);
const buildMessage = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    void store.refreshOverview();
});

onBeforeUnmount(() => {
    stopPolling();
});

/**
 * Stops run status polling.
 *
 * @returns Nothing.
 */
function stopPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Polls pipeline run status until it reaches a terminal state.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
function startPolling(runId: string): void {
    stopPolling();

    pollTimer = setInterval(() => {
        void store.getRun(runId).then((run) => {
            activeRun.value = run;

            if (run.status === "succeeded" || run.status === "failed") {
                stopPolling();
            }
        });
    }, 2500);
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

    const result = await store.triggerBuild({
        serviceName: trimmedService,
        provider: provider.value.trim() || undefined,
        registry: registry.value.trim() || undefined
    });

    if (result.runId) {
        activeRunId.value = result.runId;
        activeRun.value = await store.getRun(result.runId);
        startPolling(result.runId);
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
                    <p>{{ t("runsStatusFilter") }}: {{ activeRun.status }}</p>
                    <p v-if="activeRun.imageRef">image: {{ activeRun.imageRef }}</p>
                    <p v-if="activeRun.errorMessage" class="error">{{ activeRun.errorMessage }}</p>
                    <p v-if="activeRun.failureLog" class="log-panel">
                        <strong>{{ t("runsFailureLog") }}</strong>
                        <pre>{{ activeRun.failureLog }}</pre>
                    </p>
                </div>
                <div v-if="activeRunId">
                    <router-link :to="{ path: '/runs', query: { id: activeRunId } }">
                        {{ t("deployRunLink") }}: {{ activeRunId }}
                    </router-link>
                </div>
            </div>
        </div>
    </section>
</template>
