<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";

import type { NodeProvision } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import {
    NodeProvisionProviderRelation
} from "../domain/NodeProvisionProvider";
import { useClusterStore } from "../stores/Cluster";
import { getRelationLabel } from "../utils/Relation";

const { t } = useI18n();
const route = useRoute();
const store = useClusterStore();

const provision = ref<NodeProvision | null>(null);
const loading = ref(true);
const loadError = ref("");
const terminateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

const provisionId = computed(() => String(route.params.id ?? ""));

const stepStates = computed(() => {
    const status = provision.value?.status ?? "pending";

    return [
        { key: "pending", label: t("pages.provision.stepPending"), active: status === "pending", done: status !== "pending" && status !== "failed", failed: status === "failed" },
        { key: "launching", label: t("pages.provision.stepLaunching"), active: status === "launching", done: ["bootstrapping", "registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "bootstrapping", label: t("pages.provision.stepBootstrapping"), active: status === "bootstrapping", done: ["registered", "terminated"].includes(status), failed: status === "failed" },
        { key: "registered", label: t("pages.provision.stepRegistered"), active: status === "registered", done: status === "registered" || status === "terminated", failed: status === "failed" }
    ];
});

const canTerminate = computed(() => {
    const status = provision.value?.status;

    return Boolean(status && status !== "terminated" && status !== "failed" && status !== "pending");
});

onMounted(() => {
    void loadProvision();
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
 * Loads the provision record from the API.
 *
 * @returns Nothing.
 */
async function loadProvision(): Promise<void> {
    loading.value = true;
    loadError.value = "";

    try {
        provision.value = await store.getNodeProvision(provisionId.value);

        if (
            provision.value.status !== "registered"
            && provision.value.status !== "failed"
            && provision.value.status !== "terminated"
        ) {
            startPolling();
        }
    } catch (err) {
        loadError.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Polls node provision status until it reaches a terminal state.
 *
 * @returns Nothing.
 */
function startPolling(): void {
    stopPolling();

    pollTimer = setInterval(() => {
        void store.getNodeProvision(provisionId.value).then((next) => {
            provision.value = next;

            if (
                next.status === "registered"
                || next.status === "failed"
                || next.status === "terminated"
            ) {
                stopPolling();
            }
        });
    }, 3000);
}

/**
 * Terminates the cloud instance for this provision.
 *
 * @returns Nothing.
 */
async function terminateProvision(): Promise<void> {
    if (!provision.value) {
        return;
    }

    const updated = await nauliteClient.terminateNodeProvision(provision.value.id);
    provision.value = updated;
    stopPolling();
}
</script>

<template>
    <PageLayout title-key="pages.provision.detailTitle" hint-key="pages.provision.detailHint">
        <template #actions>
            <RouterLink to="/nodes" class="btn btn-ghost btn-sm">
                {{ t("pages.provision.backToList") }}
            </RouterLink>
            <RouterLink to="/nodes/new" class="btn btn-primary btn-sm">
                {{ t("pages.provision.newAction") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="loadError || store.error" />

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <div v-else-if="provision" class="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div class="card bg-base-100 shadow">
                <div class="card-body gap-5">
                    <div class="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p class="text-xs uppercase tracking-wide text-base-content/50">
                                {{ t("common.id") }}
                            </p>
                            <p class="font-mono text-sm">
                                {{ provision.id }}
                            </p>
                        </div>
                        <StatusPill :status="provision.status" size="md" />
                    </div>

                    <ul class="steps steps-vertical w-full lg:steps-horizontal">
                        <li
                            v-for="step in stepStates"
                            :key="step.key"
                            class="step"
                            :class="{
                                'step-primary': step.active || step.done,
                                'step-error': step.failed && provision.status === 'failed'
                            }"
                        >
                            {{ step.label }}
                        </li>
                    </ul>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <h2 class="text-lg font-semibold">
                        {{ t("pages.provision.detailSummary") }}
                    </h2>

                    <dl class="grid gap-3 sm:grid-cols-2">
                        <div>
                            <dt class="text-xs text-base-content/60">
                                {{ t("pages.provision.provider") }}
                            </dt>
                            <dd class="font-medium">
                                {{ getRelationLabel(NodeProvisionProviderRelation, provision.provider, t) }}
                            </dd>
                        </div>
                        <div>
                            <dt class="text-xs text-base-content/60">
                                {{ t("pages.provision.instanceType") }}
                            </dt>
                            <dd class="font-mono text-sm">
                                {{ provision.instanceType }}
                            </dd>
                        </div>
                        <div v-if="provision.region">
                            <dt class="text-xs text-base-content/60">
                                {{ t("pages.provision.region") }}
                            </dt>
                            <dd class="font-mono text-sm">
                                {{ provision.region }}
                            </dd>
                        </div>
                        <div v-if="provision.cloudInstanceId">
                            <dt class="text-xs text-base-content/60">
                                {{ t("pages.provision.cloudInstance") }}
                            </dt>
                            <dd class="font-mono text-sm">
                                {{ provision.cloudInstanceId }}
                            </dd>
                        </div>
                        <div v-if="provision.nodeId">
                            <dt class="text-xs text-base-content/60">
                                {{ t("pages.provision.nodeId") }}
                            </dt>
                            <dd>
                                <RouterLink :to="`/nodes/${provision.nodeId}`" class="link link-primary font-mono text-sm">
                                    {{ provision.nodeId }}
                                </RouterLink>
                            </dd>
                        </div>
                    </dl>

                    <ErrorAlert :error="provision.error ?? null" />

                    <div class="flex flex-wrap gap-3 pt-2">
                        <button
                            v-if="canTerminate"
                            type="button"
                            class="btn btn-error btn-outline btn-sm"
                            :disabled="store.loading"
                            @click="terminateModalRef?.open()"
                        >
                            {{ t("pages.provision.terminate") }}
                        </button>
                        <RouterLink
                            v-if="provision.nodeId"
                            :to="`/nodes/${provision.nodeId}`"
                            class="btn btn-outline btn-sm"
                        >
                            {{ t("pages.provision.openNode") }}
                        </RouterLink>
                    </div>
                </div>
            </div>
        </div>

        <ConfirmModal
            ref="terminateModalRef"
            title-key="pages.provision.terminateTitle"
            message-key="pages.provision.terminateMessage"
            confirm-label-key="pages.provision.terminate"
            danger
            @confirm="terminateProvision"
        />
    </PageLayout>
</template>
