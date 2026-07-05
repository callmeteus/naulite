<script setup lang="ts">
import type { NotificationProviderStatus, NotificationTestResult, PipelineEventKind } from "@naulite/sdk";
import { onMounted, ref } from "vue";

import { nauliteClient } from "../api/Client";
import { useAuthStore } from "../stores/Auth";
import { t } from "../ui/Translate";

const auth = useAuthStore();
const providers = ref<NotificationProviderStatus[]>([]);
const filtersByProvider = ref<Record<string, PipelineEventKind[]>>({});
const testResults = ref<NotificationTestResult[]>([]);
const loading = ref(false);
const testing = ref(false);
const savingProviderId = ref("");
const error = ref("");

const eventKindOptions: PipelineEventKind[] = [
    "ci.build.submitted",
    "image.build.started",
    "build.step.started",
    "build.step.finished",
    "image.pushed",
    "rollout.started",
    "rollout.finished",
    "ci.build.finished",
    "ci.pipeline.failed",
    "gitops.sync.started",
    "infra.sync.finished",
    "node.disk_pressure",
    "node.disk_pressure.cleared",
    "node.left_cluster",
    "node.joined_cluster",
    "deploy.step.started",
    "deploy.step.finished",
    "deploy.step.failed"
];

/**
 * Loads registered notification providers from the admin API.
 *
 * @returns Nothing.
 */
async function refreshProviders(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        const response = await nauliteClient.listNotificationProviders();
        providers.value = response.providers;

        const nextFilters: Record<string, PipelineEventKind[]> = {};

        await Promise.all(response.providers.map(async (provider) => {
            const filters = await nauliteClient.getNotificationProviderFilters(provider.id);
            nextFilters[provider.id] = filters.allowedKinds;
        }));

        filtersByProvider.value = nextFilters;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Sends a test notification to every registered provider.
 *
 * @returns Nothing.
 */
async function sendTestPing(): Promise<void> {
    testing.value = true;
    error.value = "";
    testResults.value = [];

    try {
        const response = await nauliteClient.testNotificationProviders();
        testResults.value = response.providers;
        await refreshProviders();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        testing.value = false;
    }
}

/**
 * Toggles a pipeline event kind in a provider filter selection.
 *
 * @param providerId Notification provider identifier
 * @param kind Pipeline event kind
 * @returns Nothing.
 */
function toggleEventKind(providerId: string, kind: PipelineEventKind): void {
    const current = filtersByProvider.value[providerId] ?? [];
    const next = current.includes(kind)
        ? current.filter((entry) => entry !== kind)
        : [...current, kind];

    filtersByProvider.value = {
        ...filtersByProvider.value,
        [providerId]: next
    };
}

/**
 * Persists provider event filters to the control plane.
 *
 * @param providerId Notification provider identifier
 * @returns Nothing.
 */
async function saveFilters(providerId: string): Promise<void> {
    savingProviderId.value = providerId;
    error.value = "";

    try {
        const allowedKinds = filtersByProvider.value[providerId] ?? [];
        const response = await nauliteClient.updateNotificationProviderFilters(providerId, allowedKinds);
        filtersByProvider.value = {
            ...filtersByProvider.value,
            [providerId]: response.allowedKinds
        };
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        savingProviderId.value = "";
    }
}

onMounted(() => {
    void refreshProviders();
});
</script>

<template>
    <section>
        <h2>{{ t("notifications") }}</h2>
        <p class="hint">{{ t("notificationsHint") }}</p>

        <div class="actions">
            <button type="button" :disabled="loading" @click="refreshProviders">
                {{ t("notificationsRefresh") }}
            </button>
            <button
                v-if="auth.hasPermission('notifications:write')"
                type="button"
                :disabled="testing || providers.length === 0"
                @click="sendTestPing"
            >
                {{ testing ? t("notificationsTesting") : t("notificationsTest") }}
            </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <table v-if="providers.length > 0">
            <thead>
                <tr>
                    <th>{{ t("notificationsProvider") }}</th>
                    <th>{{ t("notificationsUrlConfigured") }}</th>
                    <th>{{ t("notificationsSecretConfigured") }}</th>
                    <th>{{ t("notificationsEnvVars") }}</th>
                    <th>{{ t("notificationsFilters") }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="provider in providers" :key="provider.id">
                    <td>{{ provider.id }}</td>
                    <td>{{ provider.urlConfigured ? t("yes") : t("no") }}</td>
                    <td>{{ provider.secretConfigured ? t("yes") : t("no") }}</td>
                    <td>
                        <code>{{ [...provider.env.urlVars, ...provider.env.secretVars].join(", ") }}</code>
                    </td>
                    <td>
                        <div class="filter-grid">
                            <label
                                v-for="kind in eventKindOptions"
                                :key="`${provider.id}-${kind}`"
                                class="filter-option"
                            >
                                <input
                                    type="checkbox"
                                    :checked="(filtersByProvider[provider.id] ?? []).includes(kind)"
                                    :disabled="!auth.hasPermission('notifications:write')"
                                    @change="toggleEventKind(provider.id, kind)"
                                />
                                <span>{{ kind }}</span>
                            </label>
                        </div>
                        <button
                            v-if="auth.hasPermission('notifications:write')"
                            type="button"
                            :disabled="savingProviderId === provider.id"
                            @click="saveFilters(provider.id)"
                        >
                            {{ savingProviderId === provider.id ? t("notificationsSavingFilters") : t("notificationsSaveFilters") }}
                        </button>
                    </td>
                </tr>
            </tbody>
        </table>

        <p v-else-if="!loading" class="empty">{{ t("notificationsEmpty") }}</p>

        <div v-if="testResults.length > 0" class="test-results">
            <h3>{{ t("notificationsTestResults") }}</h3>
            <ul>
                <li v-for="result in testResults" :key="result.id">
                    <strong>{{ result.id }}</strong>:
                    {{ result.ok ? t("notificationsTestOk") : t("notificationsTestFailed") }}
                    <span v-if="result.error"> - {{ result.error }}</span>
                </li>
            </ul>
        </div>
    </section>
</template>

<style scoped>
.filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.25rem 0.75rem;
    margin-bottom: 0.5rem;
}

.filter-option {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.85rem;
}
</style>
