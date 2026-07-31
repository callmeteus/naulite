<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";

import type { Instance, LogsResponse } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { formatInstanceReconcileError } from "../utils/formatReconcileResults";
import {
    isAgentRelatedApiError,
    resolveInstanceIssueKey,
    shouldFetchInstanceLogs
} from "../utils/instanceDetailPresentation";

const { t } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const store = useClusterStore();

const instance = ref<Instance | null>(null);
const loading = ref(true);
const loadError = ref<ParsedApiError | null>(null);
const logsContent = ref("");
const logsLoading = ref(false);
const logsError = ref<ParsedApiError | null>(null);
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const redispatching = ref(false);
const showTechnicalDetails = ref(false);

const instanceId = computed(() => String(route.params.id ?? ""));
const canWrite = computed(() => auth.hasPermission("workloads:write"));

const canRedispatch = computed(() =>
    instance.value?.status === "pending" || instance.value?.status === "failed"
);

const statusNoticeKey = computed(() => {
    if (!instance.value) {
        return undefined;
    }

    return resolveInstanceIssueKey(instance.value);
});

const visibleActionError = computed(() => {
    if (!actionError.value || isAgentRelatedApiError(actionError.value)) {
        return null;
    }

    return actionError.value;
});

const logsNotice = computed(() => {
    if (!instance.value || logsLoading.value) {
        return "";
    }

    if (!shouldFetchInstanceLogs(instance.value) || isAgentRelatedApiError(logsError.value)) {
        return t("pages.instanceDetail.logsUnavailable");
    }

    if (logsError.value) {
        return logsError.value.message;
    }

    return logsContent.value;
});

const showLogsPre = computed(() =>
    Boolean(logsContent.value)
    && !logsLoading.value
    && !logsError.value
    && shouldFetchInstanceLogs(instance.value!)
);

onMounted(() => {
    void loadInstance();
});

watch(instanceId, () => {
    void loadInstance();
});

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
 * Normalizes log payloads from the control plane API.
 *
 * @param response Logs API response
 * @returns Log text for display
 */
function formatLogs(response: LogsResponse & { logs?: string }): string {
    if (Array.isArray(response.lines) && response.lines.length > 0) {
        return response.lines.join("\n");
    }

    if (typeof response.logs === "string" && response.logs.length > 0) {
        return response.logs;
    }

    return "";
}

/**
 * Loads instance detail and optionally fetches logs.
 *
 * @returns Nothing.
 */
async function loadInstance(): Promise<void> {
    loading.value = true;
    loadError.value = null;
    actionMessage.value = "";
    actionError.value = null;
    showTechnicalDetails.value = false;
    instance.value = null;
    logsContent.value = "";
    logsError.value = null;

    try {
        instance.value = await nauliteClient.getInstance(instanceId.value);
    } catch (err) {
        loadError.value = parseApiError(err);
    } finally {
        loading.value = false;
    }

    if (instance.value && shouldFetchInstanceLogs(instance.value)) {
        void loadLogs();
    }
}

/**
 * Fetches instance logs from the agent.
 *
 * @returns Nothing.
 */
async function loadLogs(): Promise<void> {
    if (!instance.value || !shouldFetchInstanceLogs(instance.value)) {
        logsContent.value = "";
        logsError.value = null;
        logsLoading.value = false;

        return;
    }

    logsLoading.value = true;
    logsError.value = null;
    logsContent.value = "";

    try {
        const response = await nauliteClient.getLogs(instanceId.value);
        logsContent.value = formatLogs(response);

        if (!logsContent.value) {
            logsContent.value = t("pages.instanceDetail.logsEmpty");
        }
    } catch (err) {
        logsError.value = parseApiError(err);
    } finally {
        logsLoading.value = false;
    }
}

/**
 * Manually re-dispatches a pending or failed instance.
 *
 * @returns Nothing.
 */
async function redispatchInstance(): Promise<void> {
    actionMessage.value = "";
    actionError.value = null;
    redispatching.value = true;

    try {
        const result = await store.reconcileInstance(instanceId.value);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instanceDetail.redispatchSuccess");
        } else {
            actionError.value = {
                message: formatInstanceReconcileError(result, t("pages.instanceDetail.redispatchFailed"))
            };
        }

        instance.value = await nauliteClient.getInstance(instanceId.value);

        if (instance.value && shouldFetchInstanceLogs(instance.value)) {
            void loadLogs();
        }
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        redispatching.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.instanceDetail.title" hint-key="pages.instanceDetail.hint">
        <template #actions>
            <RouterLink to="/instances" class="btn btn-ghost btn-sm">
                {{ t("pages.instanceDetail.back") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="loadError || visibleActionError" />

        <p v-if="actionMessage" class="alert alert-success">
            {{ actionMessage }}
        </p>

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <p v-else-if="!loadError && !instance" class="text-base-content/70">
            {{ t("pages.instanceDetail.notFound") }}
        </p>

        <div v-else-if="instance" class="space-y-6">
            <p v-if="statusNoticeKey" class="alert alert-warning text-sm">
                {{ t(statusNoticeKey) }}
            </p>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 class="card-title text-lg font-mono">{{ instance.id }}</h2>
                            <p class="text-sm text-base-content/70">{{ instance.serviceName }}</p>
                        </div>
                        <StatusPill :status="instance.status" />
                    </div>

                    <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <p>
                            <span class="font-medium">{{ t("pages.instanceDetail.node") }}:</span>
                            <RouterLink :to="`/nodes/${instance.nodeId}`" class="link link-primary">
                                {{ instance.nodeId }}
                            </RouterLink>
                        </p>
                        <p>
                            <span class="font-medium">{{ t("pages.instanceDetail.image") }}:</span>
                            <code class="text-xs">{{ instance.image }}</code>
                        </p>
                        <p>
                            <span class="font-medium">{{ t("pages.instanceDetail.containerId") }}:</span>
                            {{ instance.containerId ?? "-" }}
                        </p>
                        <p v-if="instance.dispatchAttempts">
                            <span class="font-medium">{{ t("pages.instanceDetail.dispatchAttempts") }}:</span>
                            {{ instance.dispatchAttempts }}
                        </p>
                        <p v-if="instance.health && instance.containerId">
                            <span class="font-medium">{{ t("pages.instanceDetail.health") }}:</span>
                            {{
                                instance.health.healthy
                                    ? t("pages.instanceDetail.healthy")
                                    : t("pages.instanceDetail.unhealthy")
                            }}
                        </p>
                        <p class="text-sm text-base-content/70 md:col-span-2 xl:col-span-3">
                            {{ t("pages.instanceDetail.createdAt") }} {{ formatTimestamp(instance.createdAt) }}
                            ·
                            {{ t("pages.instanceDetail.updatedAt") }} {{ formatTimestamp(instance.updatedAt) }}
                        </p>
                    </div>

                    <div v-if="instance.lastError" class="text-sm">
                        <button
                            type="button"
                            class="btn btn-ghost btn-xs px-0"
                            @click="showTechnicalDetails = !showTechnicalDetails"
                        >
                            {{ t("pages.instanceDetail.showTechnicalDetails") }}
                        </button>
                        <p v-if="showTechnicalDetails" class="mt-1 rounded-box bg-base-300 p-2 font-mono text-xs">
                            {{ instance.lastError }}
                        </p>
                    </div>

                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="btn btn-outline btn-sm" @click="loadInstance">
                            {{ t("pages.instanceDetail.refresh") }}
                        </button>
                        <button
                            v-if="canWrite && canRedispatch"
                            type="button"
                            class="btn btn-primary btn-sm"
                            :disabled="redispatching"
                            @click="redispatchInstance"
                        >
                            {{
                                redispatching
                                    ? t("pages.instanceDetail.redispatching")
                                    : t("pages.instanceDetail.redispatch")
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 class="text-lg font-semibold">{{ t("pages.instanceDetail.logs") }}</h3>
                        <button
                            v-if="instance && shouldFetchInstanceLogs(instance)"
                            type="button"
                            class="btn btn-ghost btn-sm"
                            :disabled="logsLoading"
                            @click="loadLogs"
                        >
                            {{ t("pages.instanceDetail.refresh") }}
                        </button>
                    </div>

                    <div v-if="logsLoading" class="flex items-center gap-2">
                        <LoadingSpinner />
                        <span>{{ t("pages.instanceDetail.logsLoading") }}</span>
                    </div>

                    <pre
                        v-else-if="showLogsPre"
                        class="max-h-[32rem] overflow-auto rounded-box bg-base-300 p-4 text-xs"
                    >{{ logsContent }}</pre>

                    <p v-else class="text-sm text-base-content/70">
                        {{ logsNotice }}
                    </p>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
