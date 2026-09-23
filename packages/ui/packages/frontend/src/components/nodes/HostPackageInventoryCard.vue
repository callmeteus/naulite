<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";

import type { HostInventoryPage, HostInventoryStatusFilter, HostPackage } from "@naulite/sdk";

import { nauliteClient } from "../../api/Client";
import ConfirmModal from "../ui/ConfirmModal.vue";
import EmptyState from "../ui/EmptyState.vue";
import ErrorAlert from "../ui/ErrorAlert.vue";
import LoadingSpinner from "../ui/LoadingSpinner.vue";
import { parseApiError, type ParsedApiError } from "../../composables/useApiAction";
import { useAuthStore } from "../../stores/Auth";
import { useClusterStore } from "../../stores/Cluster";

const PACKAGE_PAGE_SIZE = 50;
const SELECT_ALL_PAGE_SIZE = 200;

const props = defineProps<{
    /**
     * Node whose packages are listed.
     */
    nodeId: string;

    /**
     * Whether this node can report a Linux package inventory.
     */
    supportsHostInventory: boolean;

    /**
     * Whether the node is offline, so inventory errors use the unreachable copy.
     */
    showAgentUnreachable: boolean;

    /**
     * Whether the parent has finished loading the node record.
     */
    ready: boolean;
}>();

const emit = defineEmits<{
    loaded: [payload: { packageManager: string }];
    updated: [];
}>();

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();

const packages = ref<HostPackage[]>([]);
const summary = ref<HostInventoryPage["summary"] | null>(null);
const filteredTotal = ref(0);
const hasMore = ref(false);
const page = ref(1);
const packageFilter = ref<HostInventoryStatusFilter>("all");
const selectedPackages = ref<string[]>([]);
const inventoryError = ref<ParsedApiError | null>(null);
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const inventoryLoading = ref(false);
const updateInProgress = ref(false);
const collected = ref(false);
const packageUpdateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const systemUpdateModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const canUpdateHost = computed(() => auth.hasPermission("nodes:host-update"));

const isUnsupportedOsError = computed(() =>
    inventoryError.value?.i18n === "errors.hostInventoryUnsupportedOs"
);

const outdatedCount = computed(() => summary.value?.outdated ?? 0);

const upToDateCount = computed(() => {
    if (!summary.value) {
        return 0;
    }

    return summary.value.total - summary.value.outdated;
});

const totalPages = computed(() => {
    const count = Math.ceil(filteredTotal.value / PACKAGE_PAGE_SIZE);

    return count > 0 ? count : 1;
});

const pageLabel = computed(() => `${page.value} / ${totalPages.value}`);

const canGoPrevious = computed(() => page.value > 1 && !inventoryLoading.value);

const canGoNext = computed(() => hasMore.value && !inventoryLoading.value);

const canRunPackageUpdate = computed(() =>
    canUpdateHost.value
    && summary.value !== null
    && !updateInProgress.value
    && (selectedPackages.value.length > 0 || outdatedCount.value > 0)
);

const canRunSystemUpdate = computed(() =>
    canUpdateHost.value
    && summary.value !== null
    && !updateInProgress.value
);

watch(
    () => [props.ready, props.nodeId, props.supportsHostInventory] as const,
    () => {
        if (!props.ready) {
            return;
        }

        if (!props.supportsHostInventory) {
            packages.value = [];
            summary.value = null;
            inventoryError.value = {
                message: t("errors.hostInventoryUnsupportedOs"),
                i18n: "errors.hostInventoryUnsupportedOs"
            };
            return;
        }

        collected.value = false;
        page.value = 1;
        packageFilter.value = "all";
        selectedPackages.value = [];
        void loadPackages(true);
    },
    { immediate: true }
);

/**
 * Loads the current page from the control plane.
 *
 * @param refresh When true, the control plane collects a new snapshot from the agent first
 * @returns Nothing.
 */
async function loadPackages(refresh: boolean): Promise<void> {
    if (!props.ready || !props.supportsHostInventory) {
        return;
    }

    actionMessage.value = "";
    actionError.value = null;
    inventoryError.value = null;
    inventoryLoading.value = true;

    try {
        const response = await nauliteClient.getNodeHostPackages(props.nodeId, {
            refresh: refresh && !collected.value,
            page: page.value,
            limit: PACKAGE_PAGE_SIZE,
            status: packageFilter.value
        });
        packages.value = response.items;
        filteredTotal.value = response.total;
        hasMore.value = response.hasMore;
        summary.value = response.summary;
        collected.value = true;
        emit("loaded", { packageManager: response.packageManager });
    } catch (err) {
        packages.value = [];
        summary.value = null;
        inventoryError.value = parseApiError(err);
    } finally {
        inventoryLoading.value = false;
    }
}

/**
 * Collects a fresh snapshot and shows the first page.
 *
 * @returns Nothing.
 */
async function refreshInventory(): Promise<void> {
    collected.value = false;
    page.value = 1;
    selectedPackages.value = [];
    await loadPackages(true);
}

/**
 * Applies a status filter and reloads the first page.
 *
 * @param status Status filter
 * @returns Nothing.
 */
async function setFilter(status: HostInventoryStatusFilter): Promise<void> {
    if (packageFilter.value === status || inventoryLoading.value) {
        return;
    }

    packageFilter.value = status;
    page.value = 1;
    await loadPackages(false);
}

/**
 * Loads the previous page.
 *
 * @returns Nothing.
 */
async function previousPage(): Promise<void> {
    if (!canGoPrevious.value) {
        return;
    }

    page.value -= 1;
    await loadPackages(false);
}

/**
 * Loads the next page.
 *
 * @returns Nothing.
 */
async function nextPage(): Promise<void> {
    if (!canGoNext.value) {
        return;
    }

    page.value += 1;
    await loadPackages(false);
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
 * Selects every outdated package by paging the backend list.
 *
 * @returns Nothing.
 */
async function selectAllOutdated(): Promise<void> {
    const names: string[] = [];
    let nextPage = 1;
    let more = true;

    try {
        while (more) {
            const response = await nauliteClient.getNodeHostPackages(props.nodeId, {
                page: nextPage,
                limit: SELECT_ALL_PAGE_SIZE,
                status: "outdated"
            });

            for (const entry of response.items) {
                names.push(entry.name);
            }

            more = response.hasMore;
            nextPage += 1;
        }
    } catch (err) {
        actionError.value = parseApiError(err);
        return;
    }

    selectedPackages.value = names;
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
 * Updates selected packages, or every outdated package when nothing is selected.
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
        const packagesToUpdate = selectedPackages.value.length > 0
            ? selectedPackages.value
            : undefined;
        const run = await store.updateNodePackages(props.nodeId, packagesToUpdate);
        actionMessage.value = t("pages.nodeDetail.packageUpdateSuccess", { status: run.status });
        selectedPackages.value = [];
        await refreshInventory();
        emit("updated");
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
        const run = await store.updateNodeSystem(props.nodeId);
        actionMessage.value = t("pages.nodeDetail.systemUpdateSuccess", {
            status: run.status,
            reboot: run.rebootRequired ? t("pages.nodeDetail.rebootRequired") : t("pages.nodeDetail.rebootNotRequired")
        });
        await refreshInventory();
        emit("updated");
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
    if (pkg.status === "outdated") {
        return t("pages.nodeDetail.outdated");
    }

    return t("pages.nodeDetail.upToDate");
}
</script>

<template>
    <div class="card bg-base-100 shadow">
        <div class="card-body gap-4">
            <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 class="text-lg font-semibold">
                        {{ t("pages.nodeDetail.packagesTitle") }}
                    </h3>
                    <p class="text-sm text-base-content/70">
                        {{ t("pages.nodeDetail.packagesHint") }}
                    </p>
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

            <ErrorAlert v-if="actionError" :error="actionError" />

            <p v-if="actionMessage" class="alert alert-success text-sm">
                {{ actionMessage }}
            </p>

            <div v-if="!ready" class="flex items-center gap-2">
                <LoadingSpinner />
                <span>{{ t("common.loading") }}</span>
            </div>

            <EmptyState
                v-else-if="!supportsHostInventory || isUnsupportedOsError"
                title-key="pages.nodeDetail.unsupportedOsTitle"
                description-key="errors.hostInventoryUnsupportedOs"
            />

            <div v-else-if="inventoryLoading && !summary" class="flex items-center gap-2">
                <LoadingSpinner />
                <span>{{ t("common.loading") }}</span>
            </div>

            <EmptyState
                v-else-if="inventoryError"
                title-key="pages.nodeDetail.inventoryEmptyTitle"
                :description-key="showAgentUnreachable
                    ? 'pages.nodeDetail.inventoryUnavailable'
                    : 'pages.nodeDetail.inventoryErrorDescription'"
                :action-label-key="supportsHostInventory ? 'pages.nodeDetail.refresh' : undefined"
                @action="refreshInventory"
            />

            <template v-else-if="summary">
                <div class="flex flex-wrap gap-2">
                    <span class="badge badge-ghost">
                        {{ t("pages.nodeDetail.statsTotal", { count: summary.total }) }}
                    </span>
                    <span
                        class="badge"
                        :class="outdatedCount > 0 ? 'badge-warning' : 'badge-success'"
                    >
                        {{ t("pages.nodeDetail.statsOutdated", { count: outdatedCount }) }}
                    </span>
                    <span class="badge badge-ghost">
                        {{ t("pages.nodeDetail.statsUpToDate", { count: upToDateCount }) }}
                    </span>
                </div>

                <div class="tabs tabs-boxed w-fit">
                    <button
                        type="button"
                        class="tab"
                        :class="{ 'tab-active': packageFilter === 'all' }"
                        @click="setFilter('all')"
                    >
                        {{ t("pages.nodeDetail.filterAll") }}
                        ({{ summary.total }})
                    </button>
                    <button
                        type="button"
                        class="tab"
                        :class="{ 'tab-active': packageFilter === 'outdated' }"
                        @click="setFilter('outdated')"
                    >
                        {{ t("pages.nodeDetail.filterOutdated") }}
                        ({{ outdatedCount }})
                    </button>
                    <button
                        type="button"
                        class="tab"
                        :class="{ 'tab-active': packageFilter === 'upToDate' }"
                        @click="setFilter('upToDate')"
                    >
                        {{ t("pages.nodeDetail.filterUpToDate") }}
                        ({{ upToDateCount }})
                    </button>
                </div>

                <EmptyState
                    v-if="packages.length === 0 && packageFilter === 'outdated'"
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
                            <tr v-for="pkg in packages" :key="pkg.name">
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
                                <td class="font-medium">
                                    {{ pkg.name }}
                                </td>
                                <td class="font-mono text-sm">
                                    {{ pkg.installedVersion }}
                                </td>
                                <td class="font-mono text-sm">
                                    {{ pkg.availableVersion ?? "-" }}
                                </td>
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

                <div v-if="filteredTotal > 0" class="flex items-center justify-end gap-2">
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
                        <h4 class="font-medium">
                            {{ t("pages.nodeDetail.systemUpdateSectionTitle") }}
                        </h4>
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
                <ul
                    v-if="selectedPackages.length > 0"
                    class="max-h-48 list-disc space-y-1 overflow-y-auto pl-5"
                >
                    <li v-for="packageName in selectedPackages" :key="packageName">
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
    </div>
</template>
