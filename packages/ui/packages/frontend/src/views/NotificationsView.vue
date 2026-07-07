<script setup lang="ts">
import type { NotificationProviderStatus, NotificationTestResult, PipelineEventKind } from "@naulite/sdk";
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
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
    <PageLayout title-key="pages.notifications.title" hint-key="pages.notifications.hint">
        <template #actions>
            <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="refreshProviders">
                {{ t("pages.notifications.refresh") }}
            </button>
            <button
                v-if="auth.hasPermission('notifications:write')"
                type="button"
                class="btn btn-primary btn-sm"
                :disabled="testing || providers.length === 0"
                @click="sendTestPing"
            >
                {{ testing ? t("pages.notifications.testing") : t("pages.notifications.test") }}
            </button>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="loading && providers.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && providers.length === 0"
            title-key="pages.notifications.emptyTitle"
            description-key="pages.notifications.emptyDescription"
        />

        <div v-else-if="providers.length > 0" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("pages.notifications.provider") }}</th>
                            <th>{{ t("pages.notifications.urlConfigured") }}</th>
                            <th>{{ t("pages.notifications.secretConfigured") }}</th>
                            <th>{{ t("pages.notifications.envVars") }}</th>
                            <th>{{ t("pages.notifications.filters") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="provider in providers" :key="provider.id">
                            <td>{{ provider.id }}</td>
                            <td>{{ provider.urlConfigured ? t("common.yes") : t("common.no") }}</td>
                            <td>{{ provider.secretConfigured ? t("common.yes") : t("common.no") }}</td>
                            <td>
                                <code class="text-xs">{{ [...provider.env.urlVars, ...provider.env.secretVars].join(", ") }}</code>
                            </td>
                            <td class="min-w-80">
                                <div class="filter-grid">
                                    <label
                                        v-for="kind in eventKindOptions"
                                        :key="`${provider.id}-${kind}`"
                                        class="filter-option"
                                    >
                                        <input
                                            type="checkbox"
                                            class="checkbox checkbox-sm"
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
                                    class="btn btn-primary btn-sm mt-2"
                                    :disabled="savingProviderId === provider.id"
                                    @click="saveFilters(provider.id)"
                                >
                                    {{
                                        savingProviderId === provider.id
                                            ? t("pages.notifications.savingFilters")
                                            : t("pages.notifications.saveFilters")
                                    }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <div v-if="testResults.length > 0" class="card bg-base-100 shadow">
            <div class="card-body">
                <h3 class="text-lg font-semibold">{{ t("pages.notifications.testResults") }}</h3>
                <ul class="mt-2 space-y-2">
                    <li v-for="result in testResults" :key="result.id" class="text-sm">
                        <strong>{{ result.id }}</strong>:
                        {{ result.ok ? t("pages.notifications.testOk") : t("pages.notifications.testFailed") }}
                        <span v-if="result.error"> - {{ result.error }}</span>
                    </li>
                </ul>
            </div>
        </div>
    </PageLayout>
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
