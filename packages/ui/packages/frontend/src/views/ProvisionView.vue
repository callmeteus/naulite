<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import type { NodeProvision } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import { useServerPagination } from "../composables/useServerPagination";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const provider = ref("aws");
const instanceType = ref("t3.small");
const amiId = ref("");
const region = ref("");
const count = ref(1);
const activeProvision = ref<NodeProvision | null>(null);
const provisionMessage = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

const {
    items: provisionHistory,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    refresh: refreshHistory,
    loading: historyLoading,
    error: historyError
} = useServerPagination((page, limit) => nauliteClient.listNodeProvisions({ page, limit }), 10);

const stepStates = computed(() => {
    const status = activeProvision.value?.status ?? "pending";

    return [
        { key: "pending", label: t("provisionStepPending"), active: status === "pending", done: status !== "pending" && status !== "failed", failed: status === "failed" },
        { key: "launching", label: t("provisionStepLaunching"), active: status === "launching", done: ["bootstrapping", "registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "bootstrapping", label: t("provisionStepBootstrapping"), active: status === "bootstrapping", done: ["registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "registered", label: t("provisionStepRegistered"), active: status === "registered", done: status === "registered" || status === "terminated", failed: status === "failed" }
    ];
});

const canTerminate = computed(() => {
    const status = activeProvision.value?.status;
    return Boolean(status && status !== "terminated" && status !== "failed" && status !== "pending");
});

onMounted(() => {
    void refreshHistory();
});

onBeforeUnmount(() => {
    stopPolling();
});

/**
 * Stops provision status polling.
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
 * Polls node provision status until it reaches a terminal state.
 *
 * @param provisionId Node provision identifier
 * @returns Nothing.
 */
function startPolling(provisionId: string): void {
    stopPolling();

    pollTimer = setInterval(() => {
        void store.getNodeProvision(provisionId).then((provision) => {
            activeProvision.value = provision;

            if (
                provision.status === "registered" ||
                provision.status === "failed" ||
                provision.status === "terminated"
            ) {
                stopPolling();
                void refreshHistory();
            }
        });
    }, 3000);
}

/**
 * Submits a node provision request to the control plane.
 *
 * @returns Nothing.
 */
async function submitProvision(): Promise<void> {
    const trimmedAmi = amiId.value.trim();
    const trimmedType = instanceType.value.trim();

    if (!trimmedAmi || !trimmedType) {
        return;
    }

    provisionMessage.value = "";
    activeProvision.value = null;

    const provision = await store.provisionNode({
        provider: provider.value.trim() || "aws",
        instanceType: trimmedType,
        amiId: trimmedAmi,
        count: count.value,
        region: region.value.trim() || undefined
    });

    activeProvision.value = provision;
    provisionMessage.value = t("provisionStarted");
    startPolling(provision.id);
    await refreshHistory();
}

/**
 * Terminates the active cloud instance for the current provision.
 *
 * @returns Nothing.
 */
async function terminateProvision(): Promise<void> {
    if (!activeProvision.value) {
        return;
    }

    const updated = await nauliteClient.terminateNodeProvision(activeProvision.value.id);
    activeProvision.value = updated;
    stopPolling();
    await refreshHistory();
}

/**
 * Loads a provision record from the history table.
 *
 * @param provisionId Node provision identifier
 * @returns Nothing.
 */
async function selectProvision(provisionId: string): Promise<void> {
    activeProvision.value = await store.getNodeProvision(provisionId);

    if (
        activeProvision.value.status !== "registered" &&
        activeProvision.value.status !== "failed" &&
        activeProvision.value.status !== "terminated"
    ) {
        startPolling(provisionId);
    }
}
</script>

<template>
    <section>
        <h2>{{ t("provision") }}</h2>
        <p class="hint">{{ t("provisionHint") }}</p>
        <p v-if="store.error || historyError" class="error">{{ store.error || historyError }}</p>

        <div class="panel">
            <form class="create-form provision-form" @submit.prevent="submitProvision">
                <label>
                    {{ t("provisionProvider") }}
                    <input v-model="provider" type="text" />
                </label>
                <label>
                    {{ t("provisionInstanceType") }}
                    <input v-model="instanceType" type="text" />
                </label>
                <label>
                    {{ t("provisionAmiId") }}
                    <input v-model="amiId" type="text" :placeholder="t('provisionAmiPlaceholder')" />
                </label>
                <label>
                    {{ t("provisionRegion") }}
                    <input v-model="region" type="text" :placeholder="t('provisionRegionPlaceholder')" />
                </label>
                <label>
                    {{ t("provisionCount") }}
                    <input v-model.number="count" type="number" min="1" max="10" />
                </label>
                <button type="submit" :disabled="store.loading || !amiId.trim() || !instanceType.trim()">
                    {{ t("provisionSubmit") }}
                </button>
            </form>

            <p v-if="provisionMessage" class="hint">{{ provisionMessage }}</p>

            <div v-if="activeProvision" class="panel-grid">
                <div>
                    <div class="stepper">
                        <div
                            v-for="step in stepStates"
                            :key="step.key"
                            class="stepper-step"
                            :class="{ active: step.active, done: step.done, failed: step.failed && activeProvision.status === 'failed' }"
                        >
                            {{ step.label }}
                        </div>
                    </div>

                    <p>ID: {{ activeProvision.id }}</p>
                    <p>{{ t("runsStatusFilter") }}: {{ activeProvision.status }}</p>
                    <p v-if="activeProvision.cloudInstanceId">
                        {{ t("provisionCloudInstance") }}: {{ activeProvision.cloudInstanceId }}
                    </p>
                    <p v-if="activeProvision.nodeId">{{ t("provisionNodeId") }}: {{ activeProvision.nodeId }}</p>
                    <p v-if="activeProvision.error" class="error">{{ activeProvision.error }}</p>

                    <button
                        v-if="canTerminate"
                        type="button"
                        class="danger"
                        :disabled="store.loading"
                        @click="terminateProvision"
                    >
                        {{ t("provisionTerminate") }}
                    </button>
                </div>
            </div>
        </div>

        <div class="panel">
            <h3>{{ t("provisionHistory") }}</h3>
            <p v-if="historyLoading">{{ t("loading") }}</p>
            <table v-else>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>{{ t("provisionProvider") }}</th>
                        <th>{{ t("runsStatusFilter") }}</th>
                        <th>{{ t("provisionInstanceType") }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="provision in provisionHistory" :key="provision.id">
                        <td>{{ provision.id }}</td>
                        <td>{{ provision.provider }}</td>
                        <td>{{ provision.status }}</td>
                        <td>{{ provision.instanceType }}</td>
                        <td>
                            <button type="button" @click="selectProvision(provision.id)">
                                {{ t("runsViewDetails") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div v-if="provisionHistory.length > 0" class="pagination">
                <button type="button" :disabled="!canGoPrevious" @click="previousPage">
                    {{ t("paginationPrevious") }}
                </button>
                <span>{{ pageLabel }}</span>
                <button type="button" :disabled="!canGoNext" @click="nextPage">
                    {{ t("paginationNext") }}
                </button>
            </div>
        </div>
    </section>
</template>
