<script setup lang="ts">
import type { Service } from "@naulite/sdk";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { formatServiceReconcileError } from "../utils/formatReconcileResults";

const { t } = useI18n();
const auth = useAuthStore();
const store = useClusterStore();
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const redispatchingService = ref<string | null>(null);

const canWrite = computed(() => auth.hasPermission("workloads:write"));

onMounted(() => {
    void store.refreshOverview();
});

/**
 * Returns whether a service can be manually re-dispatched.
 *
 * @param status Service status
 * @returns True when the service is not fully healthy
 */
function canRedispatchService(status: Service["status"]): boolean {
    return status === "pending"
        || status === "failed"
        || status === "deploying"
        || status === "degraded";
}

/**
 * Manually re-dispatches pending or failed instances for a service.
 *
 * @param serviceName Service name
 * @returns Nothing.
 */
async function redispatchService(serviceName: string): Promise<void> {
    actionMessage.value = "";
    actionError.value = null;
    redispatchingService.value = serviceName;

    try {
        const result = await store.reconcileService(serviceName);
        const dispatched = result.results.some((entry) => entry.status === "dispatched");

        if (dispatched) {
            actionMessage.value = t("pages.services.redispatchSuccess");
        } else {
            actionError.value = {
                message: formatServiceReconcileError(
                    result,
                    t("pages.services.redispatchFailed"),
                    t("pages.services.redispatchNoTargets")
                ) ?? t("pages.services.redispatchFailed")
            };
        }

        await store.refreshOverview();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        redispatchingService.value = null;
    }
}
</script>

<template>
    <PageLayout title-key="pages.services.title" hint-key="pages.services.hint">
        <ErrorAlert :error="store.error || actionError" />

        <p v-if="actionMessage" class="alert alert-success">{{ actionMessage }}</p>

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.services.length === 0"
            title-key="pages.services.emptyTitle"
            description-key="pages.services.emptyDescription"
            action-label-key="pages.services.emptyAction"
            action-to="/deploy"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.tableColumns.name") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.replicas") }}</th>
                            <th>{{ t("common.tableColumns.lifecycle") }}</th>
                            <th v-if="canWrite">{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="service in store.services" :key="service.name">
                            <td>{{ service.name }}</td>
                            <td><StatusPill :status="service.status" /></td>
                            <td>{{ service.desiredReplicas }}</td>
                            <td>
                                <StatusPill v-if="service.lifecycleStatus" :status="service.lifecycleStatus" />
                                <span v-else>-</span>
                            </td>
                            <td v-if="canWrite">
                                <button
                                    v-if="canRedispatchService(service.status)"
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    :disabled="redispatchingService === service.name"
                                    @click="redispatchService(service.name)"
                                >
                                    {{
                                        redispatchingService === service.name
                                            ? t("pages.services.redispatching")
                                            : t("pages.services.redispatch")
                                    }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </PageLayout>
</template>
