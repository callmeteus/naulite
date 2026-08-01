<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { HostInventory, HostPackage, HostUpdateRun, Instance } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import MetadataGrid from "../components/ui/MetadataGrid.vue";
import MetadataGridItem from "../components/ui/MetadataGridItem.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { isAgentRelatedApiError } from "../utils/instanceDetailPresentation";
import { formatNodeOsLabel } from "../utils/formatNodePresentation";

enum PackageFilter {
    ALL = "all",
    OUTDATED = "outdated",
    UP_TO_DATE = "upToDate"
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useClusterStore();
const auth = useAuthStore();

const nodeId = computed(() => String(route.params.id));
const node = computed(() => store.nodes.find((entry) => entry.id === nodeId.value) ?? null);
const nodeInstances = ref<Instance[]>([]);
const workloadsLoading = ref(false);
const workloadsError = ref<ParsedApiError | null>(null);
const inventory = ref<HostInventory | null>(null);
const inventoryError = ref<ParsedApiError | null>(null);
const updateRuns = ref<HostUpdateRun[]>([]);
const selectedPackages = ref<string[]>([]);
const packageFilter = ref<PackageFilter>(PackageFilter.ALL);
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const inventoryLoading = ref(false);
const updateInProgress = ref(false);
const packageUpdateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const systemUpdateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const canUpdateHost = computed(() => auth.hasPermission("nodes:host-update"));
const supportsHostInventory = computed(() => node.value?.osFamily === "linux");

const showAgentUnreachableBanner = computed(() =>
    isAgentRelatedApiError(inventoryError.value)
);

const isUnsupportedOsError = computed(() =>
    inventoryError.value?.i18n === "errors.hostInventoryUnsupportedOs"
);

const hasInventory = computed(() => inventory.value !== null);

const outdatedPackages = computed(() =>
    (inventory.value?.packages ?? []).filter((entry) => entry.status === "outdated")
);

const outdatedCount = computed(() => outdatedPackages.value.length);

const runningInstanceCount = computed(() =>
    nodeInstances.value.filter((entry) => entry.status === "running").length
);

const visiblePackages = computed(() => {
    const packages = inventory.value?.packages ?? [];

    if (packageFilter.value === PackageFilter.OUTDATED) {
        return packages.filter((entry) => entry.status === "outdated");
    }

    if (packageFilter.value === PackageFilter.UP_TO_DATE) {
        return packages.filter((entry) => entry.status !== "outdated");
    }

    return packages;
});

const packagesPendingUpdate = computed(() => {
    if (selectedPackages.value.length > 0) {
        return selectedPackages.value;
    }

    return outdatedPackages.value.map((entry) => entry.name);
});

const canRunPackageUpdate = computed(() =>
    canUpdateHost.value
    && hasInventory.value
    && !updateInProgress.value
    && packagesPendingUpdate.value.length > 0
);

const canRunSystemUpdate = computed(() =>
    canUpdateHost.value
    && hasInventory.value
    && !updateInProgress.value
);

onMounted(async () => {
    if (store.nodes.length === 0) {
        await store.refreshOverview({ silent: true });
    }

    await refreshWorkloads();

    if (!supportsHostInventory.value) {
        inventoryError.value = {
            message: t("errors.hostInventoryUnsupportedOs"),
            i18n: "errors.hostInventoryUnsupportedOs"
        };
        return;
    }

    await refreshInventory();
    await refreshUpdates();
});

/**
 * Reloads workload instances scheduled on this node.
 *
 * @returns Nothing.
 */
async function refreshWorkloads(): Promise<void> {
    workloadsLoading.value = true;
    workloadsError.value = null;

    try {
        nodeInstances.value = await nauliteClient.listInstances({ nodeId: nodeId.value });
    } catch (err) {
        nodeInstances.value = [];
        workloadsError.value = parseApiError(err);
    } finally {
        workloadsLoading.value = false;
    }
}

/**
 * Opens the instance detail page.
 *
 * @param instanceId Instance identifier
 * @returns Nothing.
 */
function openInstance(instanceId: string): void {
    void router.push(`/instances/${instanceId}`);
}

/**
 * Reloads the host inventory snapshot for the current node.
 *
 * @returns Nothing.
 */
async function refreshInventory(): Promise<void> {
    if (!supportsHostInventory.value) {
        return;
    }

    actionMessage.value = "";
    actionError.value = null;
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
    if (!supportsHostInventory.value) {
        return;
    }

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
 * Selects every outdated package in the current inventory.
 *
 * @returns Nothing.
 */
function selectAllOutdated(): void {
    selectedPackages.value = outdatedPackages.value.map((entry) => entry.name);
}

/**
 * Clears the current package selection.
 *
 * @returns Nothing.
 */
function clearSelection(): void {
    selectedPackages.value = [];
}

/**
 * Opens the package update confirmation modal.
 *
 * @returns Nothing.
 */
function openPackageUpdateModal(): void {
    if (!canRunPackageUpdate.value) {
        return;
    }

    packageUpdateModalRef.value?.open();
}

/**
 * Opens the system update confirmation modal.
 *
 * @returns Nothing.
 */
function openSystemUpdateModal(): void {
    if (!canRunSystemUpdate.value) {
        return;
    }

    systemUpdateModalRef.value?.open();
}

/**
 * Updates selected packages or all outdated packages.
 *
 * @returns Nothing.
 */
async function confirmPackageUpdate(): Promise<void> {
    if (!canRunPackageUpdate.value) {
        return;
    }

    updateInProgress.value = true;
    actionError.value = null;

    try {
        const packages = packagesPendingUpdate.value;
        const run = await store.updateNodePackages(nodeId.value, packages);
        actionMessage.value = t("pages.nodeDetail.packageUpdateSuccess", { status: run.status });
        selectedPackages.value = [];
        await refreshInventory();
        await refreshUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        updateInProgress.value = false;
    }
}

/**
 * Performs a full system update on the node.
 *
 * @returns Nothing.
 */
async function confirmSystemUpdate(): Promise<void> {
    if (!canRunSystemUpdate.value) {
        return;
    }

    updateInProgress.value = true;
    actionError.value = null;

    try {
        const run = await store.updateNodeSystem(nodeId.value);
        actionMessage.value = t("pages.nodeDetail.systemUpdateSuccess", {
            status: run.status,
            reboot: run.rebootRequired ? t("pages.nodeDetail.rebootRequired") : t("pages.nodeDetail.rebootNotRequired")
        });
        await refreshInventory();
        await refreshUpdates();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        updateInProgress.value = false;
    }
}

/**
 * Returns a localized label for a package status.
 *
 * @param pkg Host package row
 * @returns Status label
 */
function packageStatusLabel(pkg: HostPackage): string {
    return pkg.status === "outdated"
        ? t("pages.nodeDetail.outdated")
        : t("pages.nodeDetail.upToDate");
}
</script>

<template>
    <PageLayout title-key="pages.nodeDetail.title" hint-key="pages.nodeDetail.hint">
        <template #actions>
            <RouterLink to="/nodes" class="btn btn-ghost btn-sm">
                {{ t("pages.nodeDetail.back") }}
            </RouterLink>
        </template>

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

        <ErrorAlert v-else-if="inventoryError && !isUnsupportedOsError" :error="inventoryError" />
        <ErrorAlert v-if="actionError" :error="actionError" />

        <p v-if="actionMessage" class="alert alert-success text-sm">
            {{ actionMessage }}
        </p>

        <div class="space-y-6">
            <div class="card bg-base-100 shadow">
                <div class="card-body gap-3">
                    <h2 class="card-title text-lg">{{ node?.hostname ?? nodeId }}</h2>
                    <MetadataGrid :columns="4">
                        <MetadataGridItem :label="t('common.status')">
                            <StatusPill v-if="node" :status="node.status" />
                            <span v-else>-</span>
                        </MetadataGridItem>
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.os')"
                            :value="formatNodeOsLabel(node?.osFamily, node?.osVersion)"
                        />
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.arch')"
                            :value="node?.arch"
                        />
                        <MetadataGridItem
                            :label="t('pages.nodeDetail.packageManager')"
                            :value="inventory?.packageManager"
                        />
                    </MetadataGrid>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 class="text-lg font-semibold">{{ t("pages.nodeDetail.workloadsTitle") }}</h3>
                            <p class="text-sm text-base-content/70">{{ t("pages.nodeDetail.workloadsHint") }}</p>
                        </div>
                        <button
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="workloadsLoading"
                            @click="refreshWorkloads"
                        >
                            {{ t("pages.nodeDetail.workloadsRefresh") }}
                        </button>
                    </div>

                    <ErrorAlert :error="workloadsError" />

                    <div v-if="workloadsLoading && nodeInstances.length === 0" class="flex items-center gap-2">
                        <LoadingSpinner />
                        <span>{{ t("common.loading") }}</span>
                    </div>

                    <EmptyState
                        v-else-if="!workloadsError && nodeInstances.length === 0"
                        title-key="pages.nodeDetail.workloadsEmptyTitle"
                        description-key="pages.nodeDetail.workloadsEmptyDescription"
                        action-label-key="pages.nodeDetail.workloadsEmptyAction"
                        action-to="/runs/deploy"
                    />

                    <template v-else-if="!workloadsError">
                        <div class="flex flex-wrap gap-2">
                            <span class="badge badge-ghost">
                                {{ t("pages.nodeDetail.workloadsStatsTotal", { count: nodeInstances.length }) }}
                            </span>
                            <span
                                class="badge"
                                :class="runningInstanceCount > 0 ? 'badge-success' : 'badge-ghost'"
                            >
                                {{ t("pages.nodeDetail.workloadsStatsRunning", { count: runningInstanceCount }) }}
                            </span>
                        </div>

                        <div class="overflow-x-auto rounded-box border border-base-300">
                            <table class="table table-zebra">
                                <thead>
                                    <tr>
                                        <th>{{ t("common.id") }}</th>
                                        <th>{{ t("common.tableColumns.service") }}</th>
                                        <th>{{ t("common.status") }}</th>
                                        <th>{{ t("common.tableColumns.image") }}</th>
                                        <th>{{ t("pages.nodeDetail.containerId") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr
                                        v-for="instance in nodeInstances"
                                        :key="instance.id"
                                        class="cursor-pointer hover:bg-base-200/60"
                                        @click="openInstance(instance.id)"
                                    >
                                        <td>
                                            <RouterLink
                                                :to="`/instances/${instance.id}`"
                                                class="link link-hover font-mono text-sm"
                                                @click.stop
                                            >
                                                {{ instance.id }}
                                            </RouterLink>
                                        </td>
                                        <td>
                                            <RouterLink
                                                :to="`/services/${instance.serviceName}`"
                                                class="link link-primary"
                                                @click.stop
                                            >
                                                {{ instance.serviceName }}
                                            </RouterLink>
                                        </td>
                                        <td><StatusPill :status="instance.status" /></td>
                                        <td class="max-w-xs truncate font-mono text-xs" :title="instance.image">
                                            {{ instance.image }}
                                        </td>
                                        <td class="font-mono text-xs">
                                            {{ instance.containerId ?? "-" }}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </template>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 class="text-lg font-semibold">{{ t("pages.nodeDetail.packagesTitle") }}</h3>
                            <p class="text-sm text-base-content/70">{{ t("pages.nodeDetail.packagesHint") }}</p>
                        </div>
                        <button
                            v-if="supportsHostInventory"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="inventoryLoading || updateInProgress"
                            @click="refreshInventory"
                        >
                            {{ t("pages.nodeDetail.refresh") }}
                        </button>
                    </div>

                    <EmptyState
                        v-if="!supportsHostInventory || isUnsupportedOsError"
                        title-key="pages.nodeDetail.unsupportedOsTitle"
                        description-key="errors.hostInventoryUnsupportedOs"
                    />

                    <div v-else-if="inventoryLoading && !inventory" class="flex items-center gap-2">
                        <LoadingSpinner />
                        <span>{{ t("common.loading") }}</span>
                    </div>

                    <EmptyState
                        v-else-if="inventoryError"
                        title-key="pages.nodeDetail.inventoryEmptyTitle"
                        :description-key="showAgentUnreachableBanner
                            ? 'pages.nodeDetail.inventoryUnavailable'
                            : 'pages.nodeDetail.inventoryErrorDescription'"
                        :action-label-key="supportsHostInventory ? 'pages.nodeDetail.refresh' : undefined"
                        @action="refreshInventory"
                    />

                    <template v-else-if="inventory">
                        <div class="flex flex-wrap gap-2">
                            <span class="badge badge-ghost">
                                {{ t("pages.nodeDetail.statsTotal", { count: inventory.summary.total }) }}
                            </span>
                            <span
                                class="badge"
                                :class="outdatedCount > 0 ? 'badge-warning' : 'badge-success'"
                            >
                                {{ t("pages.nodeDetail.statsOutdated", { count: outdatedCount }) }}
                            </span>
                            <span class="badge badge-ghost">
                                {{ t("pages.nodeDetail.statsUpToDate", {
                                    count: inventory.summary.total - outdatedCount
                                }) }}
                            </span>
                        </div>

                        <div class="tabs tabs-boxed w-fit">
                            <button
                                type="button"
                                class="tab"
                                :class="{ 'tab-active': packageFilter === PackageFilter.ALL }"
                                @click="packageFilter = PackageFilter.ALL"
                            >
                                {{ t("pages.nodeDetail.filterAll") }}
                                ({{ inventory.summary.total }})
                            </button>
                            <button
                                type="button"
                                class="tab"
                                :class="{ 'tab-active': packageFilter === PackageFilter.OUTDATED }"
                                @click="packageFilter = PackageFilter.OUTDATED"
                            >
                                {{ t("pages.nodeDetail.filterOutdated") }}
                                ({{ outdatedCount }})
                            </button>
                            <button
                                type="button"
                                class="tab"
                                :class="{ 'tab-active': packageFilter === PackageFilter.UP_TO_DATE }"
                                @click="packageFilter = PackageFilter.UP_TO_DATE"
                            >
                                {{ t("pages.nodeDetail.filterUpToDate") }}
                                ({{ inventory.summary.total - outdatedCount }})
                            </button>
                        </div>

                        <EmptyState
                            v-if="visiblePackages.length === 0 && packageFilter === PackageFilter.OUTDATED"
                            title-key="pages.nodeDetail.allUpToDateTitle"
                            description-key="pages.nodeDetail.allUpToDateDescription"
                        />

                        <div v-else class="overflow-x-auto rounded-box border border-base-300">
                            <table class="table table-zebra">
                                <thead>
                                    <tr>
                                        <th v-if="canUpdateHost && outdatedCount > 0" />
                                        <th>{{ t("pages.nodeDetail.packageName") }}</th>
                                        <th>{{ t("pages.nodeDetail.installedVersion") }}</th>
                                        <th>{{ t("pages.nodeDetail.availableVersion") }}</th>
                                        <th>{{ t("common.status") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="pkg in visiblePackages" :key="pkg.name">
                                        <td v-if="canUpdateHost && outdatedCount > 0">
                                            <input
                                                v-if="pkg.status === 'outdated'"
                                                type="checkbox"
                                                class="checkbox checkbox-sm"
                                                :checked="selectedPackages.includes(pkg.name)"
                                                :disabled="updateInProgress"
                                                @change="togglePackage(pkg.name)"
                                            />
                                        </td>
                                        <td class="font-medium">{{ pkg.name }}</td>
                                        <td class="font-mono text-sm">{{ pkg.installedVersion }}</td>
                                        <td class="font-mono text-sm">{{ pkg.availableVersion ?? "-" }}</td>
                                        <td>
                                            <span
                                                class="badge badge-sm"
                                                :class="pkg.status === 'outdated' ? 'badge-warning' : 'badge-success'"
                                            >
                                                {{ packageStatusLabel(pkg) }}
                                            </span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div
                            v-if="canUpdateHost"
                            class="flex flex-col gap-4 border-t border-base-300 pt-4"
                        >
                            <div v-if="outdatedCount > 0" class="flex flex-wrap items-center gap-2">
                                <button
                                    v-if="selectedPackages.length > 0"
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    :disabled="!canRunPackageUpdate"
                                    @click="openPackageUpdateModal"
                                >
                                    {{
                                        t("pages.nodeDetail.updateSelectedWithCount", {
                                            count: selectedPackages.length
                                        })
                                    }}
                                </button>
                                <button
                                    v-else
                                    type="button"
                                    class="btn btn-primary btn-sm"
                                    :disabled="!canRunPackageUpdate"
                                    @click="openPackageUpdateModal"
                                >
                                    {{
                                        t("pages.nodeDetail.updateAllWithCount", {
                                            count: outdatedCount
                                        })
                                    }}
                                </button>
                                <button
                                    v-if="selectedPackages.length > 0"
                                    type="button"
                                    class="btn btn-ghost btn-sm"
                                    :disabled="updateInProgress"
                                    @click="clearSelection"
                                >
                                    {{ t("pages.nodeDetail.clearSelection") }}
                                </button>
                                <button
                                    v-else-if="outdatedCount > 1"
                                    type="button"
                                    class="btn btn-ghost btn-sm"
                                    :disabled="updateInProgress"
                                    @click="selectAllOutdated"
                                >
                                    {{ t("pages.nodeDetail.selectAllOutdated") }}
                                </button>
                            </div>

                            <p v-else class="text-sm text-success">
                                {{ t("pages.nodeDetail.allUpToDateDescription") }}
                            </p>

                            <div class="rounded-box border border-warning/30 bg-warning/5 p-4">
                                <h4 class="font-medium">{{ t("pages.nodeDetail.systemUpdateSectionTitle") }}</h4>
                                <p class="mt-1 text-sm text-base-content/70">
                                    {{ t("pages.nodeDetail.systemUpdateSectionHint") }}
                                </p>
                                <button
                                    type="button"
                                    class="btn btn-warning btn-outline btn-sm mt-3"
                                    :disabled="!canRunSystemUpdate"
                                    @click="openSystemUpdateModal"
                                >
                                    {{ t("pages.nodeDetail.systemUpdate") }}
                                </button>
                            </div>
                        </div>
                    </template>
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

        <ConfirmModal
            ref="packageUpdateModalRef"
            title-key="pages.nodeDetail.confirmPackageUpdateTitle"
            confirm-label-key="pages.nodeDetail.updateSelected"
            @confirm="confirmPackageUpdate"
        >
            <div class="space-y-3 py-4 text-sm">
                <p>
                    {{
                        selectedPackages.length > 0
                            ? t("pages.nodeDetail.confirmPackageUpdateSelected", {
                                count: selectedPackages.length
                            })
                            : t("pages.nodeDetail.confirmPackageUpdateAll", {
                                count: outdatedCount
                            })
                    }}
                </p>
                <ul class="max-h-48 list-disc space-y-1 overflow-y-auto pl-5">
                    <li v-for="packageName in packagesPendingUpdate" :key="packageName">
                        {{ packageName }}
                    </li>
                </ul>
            </div>
        </ConfirmModal>

        <ConfirmModal
            ref="systemUpdateModalRef"
            title-key="pages.nodeDetail.confirmSystemUpdateTitle"
            confirm-label-key="pages.nodeDetail.systemUpdate"
            danger
            @confirm="confirmSystemUpdate"
        >
            <p class="py-4 text-sm">
                {{ t("pages.nodeDetail.confirmSystemUpdateBody") }}
            </p>
        </ConfirmModal>
    </PageLayout>
</template>
