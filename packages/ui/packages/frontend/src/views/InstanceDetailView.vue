<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { Instance, LogsResponse } from "@naulite/sdk";
import { CircleAlert, CircleCheck } from "@lucide/vue";
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
import { formatInstanceReconcileError } from "../utils/formatReconcileResults";
import {
    isAgentRelatedApiError,
    resolveInstanceIssueKey,
    shouldFetchInstanceLogs,
    shouldFollowInstanceLogs,
    shouldWatchInstanceState
} from "../utils/instanceDetailPresentation";

enum InstanceDetailTab {
    OVERVIEW = "overview",
    LOGS = "logs"
}

const INSTANCE_POLL_MS = 3_000;
const LOG_FOLLOW_MS = 5_000;

let statePollTimer: ReturnType<typeof setInterval> | null = null;
let logFollowTimer: ReturnType<typeof setInterval> | null = null;

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
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
const stopping = ref(false);
const starting = ref(false);
const restarting = ref(false);
const removing = ref(false);
const showTechnicalDetails = ref(false);
const removeModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const removeRunning = ref(false);

const instanceId = computed(() => String(route.params.id ?? ""));
const canWrite = computed(() => auth.hasPermission("workloads:write"));

const activeTab = computed({
    get(): InstanceDetailTab {
        const tab = String(route.query.tab ?? InstanceDetailTab.OVERVIEW);

        if (tab === InstanceDetailTab.LOGS) {
            return InstanceDetailTab.LOGS;
        }

        return InstanceDetailTab.OVERVIEW;
    },

    set(tab: InstanceDetailTab) {
        void router.replace({
            path: route.path,
            query: {
                ...route.query,
                tab
            }
        });
    }
});

const canRedispatch = computed(() =>
    instance.value?.status === "pending" || instance.value?.status === "failed"
);

const canStop = computed(() => {
    const status = instance.value?.status;

    return status === "running"
        || status === "starting"
        || status === "pulling"
        || status === "creating";
});

const canStart = computed(() => instance.value?.status === "stopped");

const canRestart = computed(() => instance.value?.status === "running");

const canRemove = computed(() => {
    const status = instance.value?.status;

    return status === "stopped" || status === "failed" || status === "running";
});

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
    && instance.value
    && shouldFetchInstanceLogs(instance.value)
);

const liveUpdateLabel = computed(() => {
    if (!instance.value) {
        return "";
    }

    if (shouldWatchInstanceState(instance.value) || shouldFollowInstanceLogs(instance.value)) {
        return t("pages.runs.polling");
    }

    return "";
});

const lifecycleBusy = computed(() =>
    stopping.value || starting.value || restarting.value || removing.value || redispatching.value
);

onMounted(() => {
    void loadInstance();
});

onBeforeUnmount(() => {
    stopLiveUpdates();
});

watch(instanceId, () => {
    void loadInstance();
});

watch(
    () => (instance.value ? [instance.value.status, instance.value.containerId ?? ""] : null),
    (key) => {
        if (!key) {
            stopLiveUpdates();
            return;
        }

        syncLiveUpdates();
    }
);

watch(activeTab, (tab) => {
    if (tab === InstanceDetailTab.LOGS && instance.value && shouldFetchInstanceLogs(instance.value)) {
        void loadLogs();
    }
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
 * Stops background polling timers for instance state and logs.
 *
 * @returns Nothing.
 */
function stopLiveUpdates(): void {
    if (statePollTimer) {
        clearInterval(statePollTimer);
        statePollTimer = null;
    }

    if (logFollowTimer) {
        clearInterval(logFollowTimer);
        logFollowTimer = null;
    }
}

/**
 * Starts or stops live updates based on the current instance state.
 *
 * @returns Nothing.
 */
function syncLiveUpdates(): void {
    stopLiveUpdates();

    if (!instance.value) {
        return;
    }

    if (shouldWatchInstanceState(instance.value)) {
        statePollTimer = setInterval(() => {
            void refreshInstance();
        }, INSTANCE_POLL_MS);
    }

    if (shouldFollowInstanceLogs(instance.value) && activeTab.value === InstanceDetailTab.LOGS) {
        logFollowTimer = setInterval(() => {
            void loadLogs(true);
        }, LOG_FOLLOW_MS);
    }
}

/**
 * Refreshes instance state without resetting page-level action feedback.
 *
 * @returns Nothing.
 */
async function refreshInstance(): Promise<void> {
    if (!instanceId.value) {
        return;
    }

    try {
        instance.value = await nauliteClient.getInstance(instanceId.value);

        if (instance.value && shouldFetchInstanceLogs(instance.value) && activeTab.value === InstanceDetailTab.LOGS) {
            void loadLogs();
        }
    } catch {
        // Keep the last known instance snapshot while polling.
    }
}

/**
 * Loads instance detail and optionally fetches logs.
 *
 * @returns Nothing.
 */
async function loadInstance(): Promise<void> {
    stopLiveUpdates();
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

    if (instance.value && shouldFetchInstanceLogs(instance.value) && activeTab.value === InstanceDetailTab.LOGS) {
        void loadLogs();
    }

    syncLiveUpdates();
}

/**
 * Fetches instance logs from the agent.
 *
 * @param preserveContent Keeps the current log text visible while refreshing
 * @returns Nothing.
 */
async function loadLogs(preserveContent = false): Promise<void> {
    if (!instance.value || !shouldFetchInstanceLogs(instance.value)) {
        logsContent.value = "";
        logsError.value = null;
        logsLoading.value = false;

        return;
    }

    logsLoading.value = !preserveContent;
    logsError.value = null;

    if (!preserveContent) {
        logsContent.value = "";
    }

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
 * Clears action feedback before a lifecycle operation.
 *
 * @returns Nothing.
 */
function resetActionFeedback(): void {
    actionMessage.value = "";
    actionError.value = null;
}

/**
 * Manually re-dispatches a pending or failed instance.
 *
 * @returns Nothing.
 */
async function redispatchInstance(): Promise<void> {
    resetActionFeedback();
    redispatching.value = true;

    try {
        const result = await store.reconcileInstance(instanceId.value);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instanceDetail.redispatchSuccess");
        } else {
            actionError.value = {
                message: formatInstanceReconcileError(
                    result,
                    t("pages.instanceDetail.redispatchFailed"),
                    t
                )
            };
        }

        instance.value = await nauliteClient.getInstance(instanceId.value);
        syncLiveUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        redispatching.value = false;
    }
}

/**
 * Stops the instance container.
 *
 * @returns Nothing.
 */
async function stopInstance(): Promise<void> {
    resetActionFeedback();
    stopping.value = true;

    try {
        const result = await nauliteClient.stopInstance(instanceId.value);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instanceDetail.stopSuccess");
        } else {
            actionError.value = {
                message: result.message ?? t("pages.instanceDetail.stopFailed")
            };
        }

        instance.value = await nauliteClient.getInstance(instanceId.value);
        syncLiveUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        stopping.value = false;
    }
}

/**
 * Starts a stopped instance.
 *
 * @returns Nothing.
 */
async function startInstance(): Promise<void> {
    resetActionFeedback();
    starting.value = true;

    try {
        const result = await nauliteClient.startInstance(instanceId.value);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instanceDetail.startSuccess");
        } else {
            actionError.value = {
                message: result.message ?? t("pages.instanceDetail.startFailed")
            };
        }

        instance.value = await nauliteClient.getInstance(instanceId.value);
        syncLiveUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        starting.value = false;
    }
}

/**
 * Restarts a running instance.
 *
 * @returns Nothing.
 */
async function restartInstance(): Promise<void> {
    resetActionFeedback();
    restarting.value = true;

    try {
        const result = await nauliteClient.restartInstance(instanceId.value);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instanceDetail.restartSuccess");
        } else {
            actionError.value = {
                message: result.message ?? t("pages.instanceDetail.restartFailed")
            };
        }

        instance.value = await nauliteClient.getInstance(instanceId.value);
        syncLiveUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        restarting.value = false;
    }
}

/**
 * Opens the remove confirmation modal.
 *
 * @returns Nothing.
 */
function openRemoveModal(): void {
    removeRunning.value = instance.value?.status === "running";
    removeModalRef.value?.open();
}

/**
 * Removes the instance from the cluster.
 *
 * @returns Nothing.
 */
async function confirmRemoveInstance(): Promise<void> {
    resetActionFeedback();
    removing.value = true;

    try {
        const result = await nauliteClient.removeInstance(instanceId.value);

        if (result.status === "dispatched") {
            await router.push("/instances");
            return;
        }

        actionError.value = {
            message: result.message ?? t("pages.instanceDetail.removeFailed")
        };
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        removing.value = false;
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

            <div class="flex flex-wrap items-center gap-2">
                <StatusPill :status="instance.status" />
                <span
                    v-if="liveUpdateLabel"
                    class="badge badge-ghost badge-sm"
                >
                    {{ liveUpdateLabel }}
                </span>
            </div>

            <div class="tabs tabs-boxed w-fit">
                <button
                    type="button"
                    class="tab"
                    :class="{ 'tab-active': activeTab === InstanceDetailTab.OVERVIEW }"
                    @click="activeTab = InstanceDetailTab.OVERVIEW"
                >
                    {{ t("pages.instanceDetail.tabOverview") }}
                </button>
                <button
                    type="button"
                    class="tab"
                    :class="{ 'tab-active': activeTab === InstanceDetailTab.LOGS }"
                    @click="activeTab = InstanceDetailTab.LOGS"
                >
                    {{ t("pages.instanceDetail.tabLogs") }}
                </button>
            </div>

            <div v-if="activeTab === InstanceDetailTab.OVERVIEW" class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h2 class="card-title text-lg font-mono">{{ instance.id }}</h2>
                            <p class="text-sm text-base-content/70">
                                <RouterLink
                                    :to="`/services/${instance.serviceName}`"
                                    class="link link-primary"
                                >
                                    {{ instance.serviceName }}
                                </RouterLink>
                            </p>
                        </div>
                    </div>

                    <MetadataGrid>
                        <MetadataGridItem :label="t('pages.instanceDetail.node')">
                            <RouterLink :to="`/nodes/${instance.nodeId}`" class="link link-primary">
                                {{ instance.nodeId }}
                            </RouterLink>
                        </MetadataGridItem>
                        <MetadataGridItem :label="t('pages.instanceDetail.image')">
                            <code class="text-xs">{{ instance.image }}</code>
                        </MetadataGridItem>
                        <MetadataGridItem
                            :label="t('pages.instanceDetail.containerId')"
                        >
                            <span class="font-mono text-sm">{{ instance.containerId ?? "-" }}</span>
                        </MetadataGridItem>
                        <MetadataGridItem
                            v-if="instance.dispatchAttempts"
                            :label="t('pages.instanceDetail.dispatchAttempts')"
                            :value="instance.dispatchAttempts"
                        />
                        <MetadataGridItem
                            v-if="instance.health && instance.containerId"
                            :label="t('pages.instanceDetail.health')"
                        >
                            <span class="inline-flex items-center gap-1.5">
                                <CircleCheck
                                    v-if="instance.health.healthy"
                                    class="size-4 shrink-0 text-success"
                                />
                                <CircleAlert
                                    v-else
                                    class="size-4 shrink-0 text-error"
                                />
                                <StatusPill
                                    :status="instance.health.healthy ? 'healthy' : 'unhealthy'"
                                />
                            </span>
                        </MetadataGridItem>
                        <MetadataGridItem
                            :label="t('pages.instanceDetail.createdAt')"
                            span="full"
                            hide-label
                        >
                            <span class="text-sm text-base-content/70">
                                {{ t("pages.instanceDetail.createdAt") }}
                                {{ formatTimestamp(instance.createdAt) }}
                                ·
                                {{ t("pages.instanceDetail.updatedAt") }}
                                {{ formatTimestamp(instance.updatedAt) }}
                            </span>
                        </MetadataGridItem>
                    </MetadataGrid>

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
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="loadInstance"
                        >
                            {{ t("pages.instanceDetail.refresh") }}
                        </button>
                        <button
                            v-if="canWrite && canRedispatch"
                            type="button"
                            class="btn btn-primary btn-sm"
                            :disabled="lifecycleBusy"
                            @click="redispatchInstance"
                        >
                            {{
                                redispatching
                                    ? t("pages.instanceDetail.redispatching")
                                    : t("pages.instanceDetail.redispatch")
                            }}
                        </button>
                        <button
                            v-if="canWrite && canStop"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="stopInstance"
                        >
                            {{
                                stopping
                                    ? t("pages.instanceDetail.stopping")
                                    : t("pages.instanceDetail.stop")
                            }}
                        </button>
                        <button
                            v-if="canWrite && canStart"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="startInstance"
                        >
                            {{
                                starting
                                    ? t("pages.instanceDetail.starting")
                                    : t("pages.instanceDetail.start")
                            }}
                        </button>
                        <button
                            v-if="canWrite && canRestart"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="restartInstance"
                        >
                            {{
                                restarting
                                    ? t("pages.instanceDetail.restarting")
                                    : t("pages.instanceDetail.restart")
                            }}
                        </button>
                        <button
                            v-if="canWrite && canRemove"
                            type="button"
                            class="btn btn-error btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="openRemoveModal"
                        >
                            {{
                                removing
                                    ? t("pages.instanceDetail.removing")
                                    : t("pages.instanceDetail.remove")
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <div v-else class="card bg-base-100 shadow">
                <div class="card-body gap-3">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h3 class="text-lg font-semibold">{{ t("pages.instanceDetail.logs") }}</h3>
                        <button
                            v-if="instance && shouldFetchInstanceLogs(instance)"
                            type="button"
                            class="btn btn-ghost btn-sm"
                            :disabled="logsLoading"
                            @click="() => void loadLogs()"
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

        <ConfirmModal
            ref="removeModalRef"
            title-key="pages.instanceDetail.removeTitle"
            confirm-label-key="pages.instanceDetail.remove"
            danger
            @confirm="confirmRemoveInstance"
        >
            <div class="space-y-3 py-4 text-sm">
                <p>{{ t("pages.instanceDetail.removeMessage", { id: instanceId }) }}</p>
                <p v-if="removeRunning" class="text-warning">
                    {{ t("pages.instanceDetail.removeRunningWarning") }}
                </p>
                <p v-if="instance">
                    {{ t("pages.instanceDetail.removeRecreateWarning") }}
                    <RouterLink
                        :to="`/services/${instance.serviceName}`"
                        class="link link-primary"
                    >
                        {{ instance.serviceName }}
                    </RouterLink>
                </p>
            </div>
        </ConfirmModal>
    </PageLayout>
</template>
