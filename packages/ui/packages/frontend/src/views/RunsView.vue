<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import type { PipelineEvent, PipelineRun } from "@platform/sdk";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const route = useRoute();
const router = useRouter();
const selectedRun = ref<PipelineRun | null>(null);
const runEvents = ref<PipelineEvent[]>([]);
const kindFilter = ref("");
const statusFilter = ref("");

onMounted(async () => {
    await store.refreshRuns({
        kind: kindFilter.value || undefined,
        status: statusFilter.value || undefined
    });

    const runId = typeof route.query.id === "string" ? route.query.id : "";

    if (runId) {
        await loadRunDetail(runId);
    }
});

/**
 * Reloads the pipeline run list with current filters.
 *
 * @returns Nothing.
 */
async function refreshList(): Promise<void> {
    await store.refreshRuns({
        kind: kindFilter.value || undefined,
        status: statusFilter.value || undefined
    });
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
    void router.replace({ query: {} });
}
</script>

<template>
    <section>
        <h2>{{ t("runs") }}</h2>
        <p class="hint">{{ t("runsHint") }}</p>
        <p v-if="store.error" class="error">{{ store.error }}</p>

        <div class="panel filters">
            <label>
                {{ t("runsKindFilter") }}
                <select v-model="kindFilter" @change="refreshList">
                    <option value="">{{ t("runsFilterAll") }}</option>
                    <option value="ci_build">ci_build</option>
                    <option value="apply">apply</option>
                    <option value="gitops_sync">gitops_sync</option>
                    <option value="node_event">node_event</option>
                </select>
            </label>
            <label>
                {{ t("runsStatusFilter") }}
                <select v-model="statusFilter" @change="refreshList">
                    <option value="">{{ t("runsFilterAll") }}</option>
                    <option value="pending">pending</option>
                    <option value="running">running</option>
                    <option value="succeeded">succeeded</option>
                    <option value="failed">failed</option>
                </select>
            </label>
            <button type="button" :disabled="store.loading" @click="refreshList">
                {{ t("runsRefresh") }}
            </button>
        </div>

        <div class="panel">
            <p v-if="store.loading">Loading...</p>
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
                    <tr v-for="run in store.runs" :key="run.id">
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
        </div>

        <div v-if="selectedRun" class="panel">
            <h3>{{ t("runsDetailTitle") }}: {{ selectedRun.id }}</h3>
            <button type="button" @click="clearSelection">{{ t("runsCloseDetail") }}</button>
            <p>{{ t("runsStatusFilter") }}: {{ selectedRun.status }}</p>
            <p v-if="selectedRun.errorMessage" class="error">{{ selectedRun.errorMessage }}</p>

            <h4>{{ t("runsSteps") }}</h4>
            <ul>
                <li v-for="step in selectedRun.steps ?? []" :key="step.id">
                    {{ step.name }} - {{ step.status }}
                </li>
            </ul>

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
