<script setup lang="ts">
import type { Instance, LogsResponse } from "@naulite/sdk";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { formatInstanceReconcileError } from "../utils/formatReconcileResults";

const { t } = useI18n();
const auth = useAuthStore();
const store = useClusterStore();
const logsDialogRef = ref<HTMLDialogElement | null>(null);
const logsInstanceId = ref("");
const logsContent = ref("");
const logsLoading = ref(false);
const logsError = ref("");
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const redispatchingInstanceId = ref<string | null>(null);

const canWrite = computed(() => auth.hasPermission("workloads:write"));

onMounted(() => {
    void store.refreshInstances();
});

/**
 * Returns whether an instance can be manually re-dispatched.
 *
 * @param status Instance status
 * @returns True for pending or failed instances
 */
function canRedispatchInstance(status: Instance["status"]): boolean {
    return status === "pending" || status === "failed";
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
 * Opens the logs dialog and fetches instance logs.
 *
 * @param instanceId Instance identifier
 * @returns Nothing.
 */
async function openLogs(instanceId: string): Promise<void> {
    logsInstanceId.value = instanceId;
    logsContent.value = "";
    logsError.value = "";
    logsLoading.value = true;
    logsDialogRef.value?.showModal();

    try {
        const response = await nauliteClient.getLogs(instanceId);
        logsContent.value = formatLogs(response);

        if (!logsContent.value) {
            logsContent.value = t("pages.instances.logsEmpty");
        }
    } catch (err) {
        logsError.value = err instanceof Error ? err.message : String(err);
    } finally {
        logsLoading.value = false;
    }
}

/**
 * Closes the logs dialog.
 *
 * @returns Nothing.
 */
function closeLogsDialog(): void {
    logsDialogRef.value?.close();
}

/**
 * Manually re-dispatches a pending or failed instance.
 *
 * @param instanceId Instance identifier
 * @returns Nothing.
 */
async function redispatchInstance(instanceId: string): Promise<void> {
    actionMessage.value = "";
    actionError.value = null;
    redispatchingInstanceId.value = instanceId;

    try {
        const result = await store.reconcileInstance(instanceId);

        if (result.status === "dispatched") {
            actionMessage.value = t("pages.instances.redispatchSuccess");
        } else {
            actionError.value = {
                message: formatInstanceReconcileError(result, t("pages.instances.redispatchFailed"))
            };
        }

        await store.refreshInstances();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        redispatchingInstanceId.value = null;
    }
}
</script>

<template>
    <PageLayout title-key="pages.instances.title" hint-key="pages.instances.hint">
        <ErrorAlert :error="store.error || actionError" />

        <p v-if="actionMessage" class="alert alert-success">{{ actionMessage }}</p>

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.instances.length === 0"
            title-key="pages.instances.emptyTitle"
            description-key="pages.instances.emptyDescription"
            action-label-key="pages.instances.emptyAction"
            action-to="/services"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.id") }}</th>
                            <th>{{ t("common.tableColumns.service") }}</th>
                            <th>{{ t("common.tableColumns.node") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.image") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="instance in store.instances" :key="instance.id">
                            <td>{{ instance.id }}</td>
                            <td>{{ instance.serviceName }}</td>
                            <td>{{ instance.nodeId }}</td>
                            <td><StatusPill :status="instance.status" /></td>
                            <td><code class="text-xs">{{ instance.image }}</code></td>
                            <td class="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    @click="openLogs(instance.id)"
                                >
                                    {{ t("pages.instances.viewLogs") }}
                                </button>
                                <button
                                    v-if="canWrite && canRedispatchInstance(instance.status)"
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    :disabled="redispatchingInstanceId === instance.id"
                                    @click="redispatchInstance(instance.id)"
                                >
                                    {{
                                        redispatchingInstanceId === instance.id
                                            ? t("pages.instances.redispatching")
                                            : t("pages.instances.redispatch")
                                    }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <dialog ref="logsDialogRef" class="modal">
            <div class="modal-box max-w-4xl">
                <h3 class="text-lg font-bold">
                    {{ t("pages.instances.logsTitle") }}
                    <span v-if="logsInstanceId" class="text-sm font-normal text-base-content/70">
                        ({{ logsInstanceId }})
                    </span>
                </h3>

                <div v-if="logsLoading" class="mt-4 flex items-center gap-2">
                    <LoadingSpinner />
                    <span>{{ t("pages.instances.logsLoading") }}</span>
                </div>

                <ErrorAlert v-else-if="logsError" :error="logsError" class="mt-4" />

                <pre
                    v-else
                    class="mt-4 max-h-96 overflow-auto rounded-box bg-base-300 p-4 text-xs"
                >{{ logsContent }}</pre>

                <div class="modal-action">
                    <button type="button" class="btn" @click="closeLogsDialog">
                        {{ t("common.dismiss") }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="button" @click="closeLogsDialog">close</button>
            </form>
        </dialog>
    </PageLayout>
</template>
