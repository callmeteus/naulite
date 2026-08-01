<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";

import type { HostInventory, HostPackage, HostUpdateRun } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { isAgentRelatedApiError } from "../utils/instanceDetailPresentation";

const { t } = useI18n();
const route = useRoute();
const store = useClusterStore();
const auth = useAuthStore();

const nodeId = computed(() => String(route.params.id));
const node = computed(() => store.nodes.find((entry) => entry.id === nodeId.value) ?? null);
const inventory = ref<HostInventory | null>(null);
const inventoryError = ref<ParsedApiError | null>(null);
const updateRuns = ref<HostUpdateRun[]>([]);
const selectedPackages = ref<string[]>([]);
const showOutdatedOnly = ref(false);
const actionMessage = ref("");
const inventoryLoading = ref(false);

const canUpdateHost = computed(() => auth.hasPermission("nodes:host-update"));

const showAgentUnreachableBanner = computed(() =>
    isAgentRelatedApiError(inventoryError.value)
);

const visiblePackages = computed(() => {
    const packages = inventory.value?.packages ?? [];

    if (!showOutdatedOnly.value) {
        return packages;
    }

    return packages.filter((entry) => entry.status === "outdated");
});

onMounted(async () => {
    if (store.nodes.length === 0) {
        await store.refreshOverview({ silent: true });
    }

    await refreshInventory();
    await refreshUpdates();
});

/**
 * Reloads the host inventory snapshot for the current node.
 *
 * @returns Nothing.
 */
async function refreshInventory(): Promise<void> {
    actionMessage.value = "";
    inventoryError.value = null;
    inventoryLoading.value = true;
    store.error = null;

    try {
        inventory.value = await nauliteClient.getNodeHostInventory(nodeId.value, { refresh: true });
        selectedPackages.value = [];
    } catch (err) {
        inventory.value = null;
        inventoryError.value = parseApiError(err);
    } finally {
        inventoryLoading.value = false;
    }
}

/**
 * Reloads historical host update runs.
 *
 * @returns Nothing.
 */
async function refreshUpdates(): Promise<void> {
    updateRuns.value = await store.listNodeHostUpdates(nodeId.value);
}

/**
 * Toggles package selection for batch updates.
 *
 * @param packageName Package name
 * @returns Nothing.
 */
function togglePackage(packageName: string): void {
    if (selectedPackages.value.includes(packageName)) {
        selectedPackages.value = selectedPackages.value.filter((entry) => entry !== packageName);
        return;
    }

    selectedPackages.value = [...selectedPackages.value, packageName];
}

/**
 * Updates selected packages or all outdated packages.
 *
 * @returns Nothing.
 */
async function updateSelectedPackages(): Promise<void> {
    if (!canUpdateHost.value) {
        return;
    }

  if (!window.confirm(t("pages.nodeDetail.confirmPackageUpdate"))) {
        return;
    }

    const packages = selectedPackages.value.length > 0
        ? selectedPackages.value
        : visiblePackages.value
            .filter((entry: HostPackage) => entry.status === "outdated")
            .map((entry) => entry.name);

    const run = await store.updateNodePackages(nodeId.value, packages.length > 0 ? packages : undefined);
    actionMessage.value = t("pages.nodeDetail.packageUpdateSuccess", { status: run.status });
    await refreshInventory();
    await refreshUpdates();
}

/**
 * Performs a full system update on the node.
 *
 * @returns Nothing.
 */
async function updateSystem(): Promise<void> {
    if (!canUpdateHost.value) {
        return;
    }

    if (!window.confirm(t("pages.nodeDetail.confirmSystemUpdate"))) {
        return;
    }

    const run = await store.updateNodeSystem(nodeId.value);
    actionMessage.value = t("pages.nodeDetail.systemUpdateSuccess", {
        status: run.status,
        reboot: run.rebootRequired ? t("pages.nodeDetail.rebootRequired") : t("pages.nodeDetail.rebootNotRequired")
    });
    await refreshInventory();
    await refreshUpdates();
}
</script>

<template>
    <PageLayout title-key="pages.nodeDetail.title" hint-key="pages.nodeDetail.hint">
        <div
            v-if="showAgentUnreachableBanner"
            class="alert border-warning/30 bg-warning/10 text-sm"
        >
            <div class="flex w-full flex-col gap-2">
                <p class="font-medium">
                    {{ t("pages.nodeDetail.agentUnreachableTitle") }}
                </p>
                <p>{{ t("pages.nodeDetail.agentUnreachableDescription") }}</p>
                <p v-if="node?.agentUrl" class="text-base-content/70">
                    {{ t("pages.nodeDetail.agentUrlLabel") }}:
                    <span class="font-mono">{{ node.agentUrl }}</span>
                </p>
            </div>
        </div>

        <ErrorAlert v-else-if="inventoryError" :error="inventoryError" />

        <div v-if="inventoryLoading && !inventory" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <div v-else class="space-y-6">
            <div class="card bg-base-100 shadow">
                <div class="card-body gap-3">
                    <h2 class="card-title text-lg">{{ node?.hostname ?? nodeId }}</h2>
                    <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                        <p><span class="font-medium">{{ t("common.status") }}:</span> <StatusPill v-if="node" :status="node.status" /></p>
                        <p><span class="font-medium">{{ t("pages.nodeDetail.os") }}:</span> {{ node?.osFamily ?? "-" }} {{ node?.osVersion ?? "" }}</p>
                        <p><span class="font-medium">{{ t("pages.nodeDetail.arch") }}:</span> {{ node?.arch ?? "-" }}</p>
                        <p><span class="font-medium">{{ t("pages.nodeDetail.packageManager") }}:</span> {{ inventory?.packageManager ?? "-" }}</p>
                    </div>
                    <p v-if="inventory" class="text-sm text-base-content/70">
                        {{ t("pages.nodeDetail.summary", {
                            total: inventory.summary.total,
                            outdated: inventory.summary.outdated
                        }) }}
                    </p>
                    <p v-if="actionMessage" class="text-sm text-success">{{ actionMessage }}</p>
                    <div class="flex flex-wrap gap-2">
                        <button type="button" class="btn btn-sm btn-outline" @click="refreshInventory">
                            {{ t("pages.nodeDetail.refresh") }}
                        </button>
                        <button
                            v-if="canUpdateHost"
                            type="button"
                            class="btn btn-sm btn-primary"
                            @click="updateSelectedPackages"
                        >
                            {{ selectedPackages.length > 0 ? t("pages.nodeDetail.updateSelected") : t("pages.nodeDetail.updateAll") }}
                        </button>
                        <button
                            v-if="canUpdateHost"
                            type="button"
                            class="btn btn-sm btn-warning"
                            @click="updateSystem"
                        >
                            {{ t("pages.nodeDetail.systemUpdate") }}
                        </button>
                        <label class="label cursor-pointer gap-2">
                            <input v-model="showOutdatedOnly" type="checkbox" class="checkbox checkbox-sm" />
                            <span class="label-text">{{ t("pages.nodeDetail.showOutdatedOnly") }}</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <p
                        v-if="!inventory && inventoryError"
                        class="p-6 text-sm text-base-content/70"
                    >
                        {{ t("pages.nodeDetail.inventoryUnavailable") }}
                    </p>
                    <table v-else class="table table-zebra">
                        <thead>
                            <tr>
                                <th v-if="canUpdateHost" />
                                <th>{{ t("pages.nodeDetail.packageName") }}</th>
                                <th>{{ t("pages.nodeDetail.installedVersion") }}</th>
                                <th>{{ t("pages.nodeDetail.availableVersion") }}</th>
                                <th>{{ t("common.status") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="pkg in visiblePackages" :key="pkg.name">
                                <td v-if="canUpdateHost">
                                    <input
                                        type="checkbox"
                                        class="checkbox checkbox-sm"
                                        :checked="selectedPackages.includes(pkg.name)"
                                        @change="togglePackage(pkg.name)"
                                    />
                                </td>
                                <td>{{ pkg.name }}</td>
                                <td>{{ pkg.installedVersion }}</td>
                                <td>{{ pkg.availableVersion ?? "-" }}</td>
                                <td>{{ pkg.status === "outdated" ? t("pages.nodeDetail.outdated") : t("pages.nodeDetail.upToDate") }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div v-if="updateRuns.length > 0" class="card bg-base-100 shadow">
                <div class="card-body">
                    <h3 class="text-lg font-semibold">{{ t("pages.nodeDetail.recentUpdates") }}</h3>
                    <div class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.id") }}</th>
                                    <th>{{ t("pages.nodeDetail.updateKind") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("pages.nodeDetail.reboot") }}</th>
                                    <th>{{ t("pages.nodeDetail.completedAt") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="run in updateRuns" :key="run.id">
                                    <td>{{ run.id }}</td>
                                    <td>{{ run.kind }}</td>
                                    <td><StatusPill :status="run.status" /></td>
                                    <td>{{ run.rebootRequired ? t("common.yes") : t("common.no") }}</td>
                                    <td>{{ run.completedAt ?? "-" }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
