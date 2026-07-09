<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { NodeProvision } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import RelationSelect from "../components/ui/RelationSelect.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useServerPagination } from "../composables/useServerPagination";
import {
    NodeProvisionProvider,
    NodeProvisionProviderRelation
} from "../domain/NodeProvisionProvider";
import { useClusterStore } from "../stores/Cluster";
import { getRelationLabel } from "../utils/Relation";

const { t } = useI18n();
const store = useClusterStore();
const provider = ref<NodeProvisionProvider>(NodeProvisionProvider.AWS);
const instanceType = ref("t3.small");
const amiId = ref("");
const region = ref("");
const count = ref(1);
const activeProvision = ref<NodeProvision | null>(null);
const provisionMessage = ref("");
const terminateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
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
        { key: "pending", label: t("pages.provision.stepPending"), active: status === "pending", done: status !== "pending" && status !== "failed", failed: status === "failed" },
        { key: "launching", label: t("pages.provision.stepLaunching"), active: status === "launching", done: ["bootstrapping", "registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "bootstrapping", label: t("pages.provision.stepBootstrapping"), active: status === "bootstrapping", done: ["registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "registered", label: t("pages.provision.stepRegistered"), active: status === "registered", done: status === "registered" || status === "terminated", failed: status === "failed" }
    ];
});

const canTerminate = computed(() => {
    const status = activeProvision.value?.status;
    return Boolean(status && status !== "terminated" && status !== "failed" && status !== "pending");
});

const combinedError = computed(() => store.error || historyError.value || null);

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
        provider: provider.value,
        instanceType: trimmedType,
        amiId: trimmedAmi,
        count: count.value,
        region: region.value.trim() || undefined
    });

    activeProvision.value = provision;
    provisionMessage.value = t("pages.provision.started");
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
    <PageLayout title-key="pages.provision.title" hint-key="pages.provision.hint">
        <ErrorAlert :error="combinedError" />

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <form class="grid gap-4 md:grid-cols-2" @submit.prevent="submitProvision">
                    <RelationSelect
                        v-model="provider"
                        :relation="NodeProvisionProviderRelation"
                        :disabled="store.loading"
                    >
                        <template #label>
                            {{ t("pages.provision.provider") }}
                        </template>
                    </RelationSelect>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.provision.instanceType") }}</span>
                        <input v-model="instanceType" type="text" class="input input-bordered w-full" />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.provision.amiId") }}</span>
                        <input
                            v-model="amiId"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.provision.amiPlaceholder')"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.provision.region") }}</span>
                        <input
                            v-model="region"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.provision.regionPlaceholder')"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.provision.count") }}</span>
                        <input
                            v-model.number="count"
                            type="number"
                            min="1"
                            max="10"
                            class="input input-bordered w-full"
                        />
                    </label>
                    <div class="flex items-end">
                        <button
                            type="submit"
                            class="btn btn-primary"
                            :disabled="store.loading || !amiId.trim() || !instanceType.trim()"
                        >
                            {{ t("pages.provision.submit") }}
                        </button>
                    </div>
                </form>

                <p v-if="provisionMessage" class="text-sm text-base-content/70">
                    {{ provisionMessage }}
                </p>

                <div v-if="activeProvision" class="space-y-4 rounded-box border border-base-300 p-4">
                    <ul class="steps steps-vertical w-full lg:steps-horizontal">
                        <li
                            v-for="step in stepStates"
                            :key="step.key"
                            class="step"
                            :class="{
                                'step-primary': step.active || step.done,
                                'step-error': step.failed && activeProvision.status === 'failed'
                            }"
                        >
                            {{ step.label }}
                        </li>
                    </ul>

                    <p><span class="font-medium">{{ t("common.id") }}:</span> {{ activeProvision.id }}</p>
                    <p>
                        <span class="font-medium">{{ t("pages.runs.statusFilter") }}:</span>
                        <StatusPill class="ml-2" :status="activeProvision.status" size="md" />
                    </p>
                    <p v-if="activeProvision.cloudInstanceId">
                        <span class="font-medium">{{ t("pages.provision.cloudInstance") }}:</span>
                        {{ activeProvision.cloudInstanceId }}
                    </p>
                    <p v-if="activeProvision.nodeId">
                        <span class="font-medium">{{ t("pages.provision.nodeId") }}:</span>
                        {{ activeProvision.nodeId }}
                    </p>
                    <ErrorAlert :error="activeProvision.error ?? null" />

                    <button
                        v-if="canTerminate"
                        type="button"
                        class="btn btn-error btn-outline btn-sm"
                        :disabled="store.loading"
                        @click="terminateModalRef?.open()"
                    >
                        {{ t("pages.provision.terminate") }}
                    </button>
                </div>
            </div>
        </div>

        <div class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <h3 class="text-lg font-semibold">
                    {{ t("pages.provision.history") }}
                </h3>

                <div v-if="historyLoading && provisionHistory.length === 0" class="flex items-center gap-2">
                    <LoadingSpinner />
                    <span>{{ t("common.loading") }}</span>
                </div>

                <EmptyState
                    v-else-if="!historyError && provisionHistory.length === 0"
                    title-key="pages.provision.emptyTitle"
                    description-key="pages.provision.emptyDescription"
                />

                <div v-else class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("pages.provision.provider") }}</th>
                                <th>{{ t("common.status") }}</th>
                                <th>{{ t("pages.provision.instanceType") }}</th>
                                <th>{{ t("common.actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="provision in provisionHistory" :key="provision.id">
                                <td>{{ provision.id }}</td>
                                <td>{{ getRelationLabel(NodeProvisionProviderRelation, provision.provider, t) }}</td>
                                <td><StatusPill :status="provision.status" /></td>
                                <td>{{ provision.instanceType }}</td>
                                <td>
                                    <button type="button" class="btn btn-outline btn-sm" @click="selectProvision(provision.id)">
                                        {{ t("pages.runs.viewDetails") }}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div v-if="provisionHistory.length > 0" class="mt-4 flex items-center justify-end gap-2">
                        <button
                            type="button"
                            class="btn btn-sm"
                            :disabled="!canGoPrevious"
                            @click="previousPage"
                        >
                            {{ t("common.paginationPrevious") }}
                        </button>
                        <span class="text-sm">{{ pageLabel }}</span>
                        <button
                            type="button"
                            class="btn btn-sm"
                            :disabled="!canGoNext"
                            @click="nextPage"
                        >
                            {{ t("common.paginationNext") }}
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <ConfirmModal
            ref="terminateModalRef"
            title-key="pages.provision.terminate"
            message-key="pages.provision.terminate"
            confirm-label-key="pages.provision.terminate"
            danger
            @confirm="terminateProvision"
        />
    </PageLayout>
</template>
