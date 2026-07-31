<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import type { ListPipelineRunsQuery, PipelineRunKind, PipelineRunStatus } from "@naulite/sdk";
import BuildTriggerCard from "../components/build/BuildTriggerCard.vue";
import QuickDeployDialog from "../components/deploy/QuickDeployDialog.vue";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useAuthStore } from "../stores/Auth";
import { useServerPagination } from "../composables/useServerPagination";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const kindFilter = ref<PipelineRunKind | "">("");
const statusFilter = ref<PipelineRunStatus | "">("");
const buildDialogRef = ref<InstanceType<typeof BuildTriggerCard> | null>(null);
const deployDialogRef = ref<InstanceType<typeof QuickDeployDialog> | null>(null);

const canBuild = computed(() => auth.hasPermission("runs:write"));
const canDeploy = computed(() => auth.hasPermission("manifests:apply"));

const {
    items: paginatedRuns,
    pageLabel,
    canGoPrevious,
    canGoNext,
    previousPage,
    nextPage,
    resetPage,
    refresh: refreshListPage,
    loading: listLoading,
    error: listError
} = useServerPagination(async (page, limit) => {
    const query: ListPipelineRunsQuery = {
        kind: kindFilter.value || undefined,
        status: statusFilter.value || undefined,
        page,
        limit
    };
    return nauliteClient.listRunsPaginated(query);
}, 15);

watch([kindFilter, statusFilter], () => {
    void resetPage();
});

onMounted(() => {
    applyRouteQuery();
});

watch(
    () => route.query,
    () => {
        applyRouteQuery();
    }
);

/**
 * Applies list filters and opens dialogs from route query parameters.
 *
 * @returns Nothing.
 */
function applyRouteQuery(): void {
    const kind = String(route.query.kind ?? "");

    if (kind === "ci_build" || kind === "apply" || kind === "gitops_sync" || kind === "node_event") {
        kindFilter.value = kind;
    }

    if (route.query.build === "open" && canBuild.value) {
        void nextTick(() => {
            buildDialogRef.value?.open();
        });
    }

    if (route.query.deploy === "open" && canDeploy.value) {
        void nextTick(() => {
            deployDialogRef.value?.open();
        });
    }
}

/**
 * Returns a localized label for a pipeline run kind.
 *
 * @param kind Pipeline run kind
 * @returns Localized label
 */
function kindLabel(kind: string): string {
    const key = `pages.runs.kinds.${kind}`;

    return t(key) === key ? kind : t(key);
}

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
 * Reloads the pipeline run list with current filters.
 *
 * @returns Nothing.
 */
async function refreshList(): Promise<void> {
    await refreshListPage();
}

/**
 * Opens the run detail page.
 *
 * @param runId Pipeline run identifier
 * @returns Nothing.
 */
function openRun(runId: string): void {
    void router.push(`/runs/${runId}`);
}

/**
 * Opens the build dialog.
 *
 * @returns Nothing.
 */
function openBuildDialog(): void {
    buildDialogRef.value?.open();
}

/**
 * Opens the quick deploy dialog.
 *
 * @returns Nothing.
 */
function openDeployDialog(): void {
    deployDialogRef.value?.open();
}

/**
 * Handles the empty-state primary action.
 *
 * @returns Nothing.
 */
function handleEmptyAction(): void {
    if (canDeploy.value) {
        openDeployDialog();
        return;
    }

    if (canBuild.value) {
        openBuildDialog();
    }
}

const emptyActionLabelKey = computed(() => {
    if (canDeploy.value) {
        return "pages.runs.emptyActionDeploy";
    }

    if (canBuild.value) {
        return "pages.runs.emptyActionBuild";
    }

    return undefined;
});
</script>

<template>
    <PageLayout title-key="pages.runs.title" hint-key="pages.runs.hint">
        <template #actions>
            <button
                v-if="canDeploy"
                type="button"
                class="btn btn-outline btn-sm"
                @click="openDeployDialog"
            >
                {{ t("pages.runs.quickDeploy") }}
            </button>
            <button
                v-if="canBuild"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openBuildDialog"
            >
                {{ t("pages.runs.buildTrigger") }}
            </button>
        </template>

        <template #filters>
            <label class="form-control w-full max-w-xs">
                <span class="label-text">{{ t("pages.runs.kindFilter") }}</span>
                <select v-model="kindFilter" class="select select-bordered select-sm w-full">
                    <option value="">{{ t("pages.runs.filterAll") }}</option>
                    <option value="ci_build">{{ t("pages.runs.kinds.ci_build") }}</option>
                    <option value="apply">{{ t("pages.runs.kinds.apply") }}</option>
                    <option value="gitops_sync">{{ t("pages.runs.kinds.gitops_sync") }}</option>
                    <option value="node_event">{{ t("pages.runs.kinds.node_event") }}</option>
                </select>
            </label>
            <label class="form-control w-full max-w-xs">
                <span class="label-text">{{ t("pages.runs.statusFilter") }}</span>
                <select v-model="statusFilter" class="select select-bordered select-sm w-full">
                    <option value="">{{ t("pages.runs.filterAll") }}</option>
                    <option value="pending">{{ t("pages.runs.statuses.pending") }}</option>
                    <option value="running">{{ t("pages.runs.statuses.running") }}</option>
                    <option value="succeeded">{{ t("pages.runs.statuses.succeeded") }}</option>
                    <option value="failed">{{ t("pages.runs.statuses.failed") }}</option>
                </select>
            </label>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="listLoading"
                @click="refreshList"
            >
                {{ t("pages.runs.refresh") }}
            </button>
        </template>

        <div class="flex flex-col gap-6">
            <BuildTriggerCard v-if="canBuild" ref="buildDialogRef" />
            <QuickDeployDialog v-if="canDeploy" ref="deployDialogRef" />

            <ErrorAlert :error="store.error || listError || null" />

            <div v-if="listLoading && paginatedRuns.length === 0" class="flex items-center gap-2">
                <LoadingSpinner />
                <span>{{ t("common.loading") }}</span>
            </div>

            <EmptyState
                v-else-if="!listError && paginatedRuns.length === 0"
                title-key="pages.runs.emptyTitle"
                description-key="pages.runs.emptyDescription"
                :action-label-key="emptyActionLabelKey"
                @action="handleEmptyAction"
            />

            <div v-else class="card bg-base-100 shadow">
                <div class="card-body gap-3 p-4 sm:p-6">
                    <div>
                        <h2 class="text-lg font-semibold">{{ t("pages.runs.listTitle") }}</h2>
                        <p class="text-sm text-base-content/70">{{ t("pages.runs.listHint") }}</p>
                    </div>

                    <div class="overflow-x-auto">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.id") }}</th>
                                    <th>{{ t("common.tableColumns.kind") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("common.tableColumns.service") }}</th>
                                    <th>{{ t("common.tableColumns.started") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr
                                    v-for="run in paginatedRuns"
                                    :key="run.id"
                                    class="cursor-pointer hover:bg-base-200/60"
                                    @click="openRun(run.id)"
                                >
                                    <td>
                                        <RouterLink
                                            :to="`/runs/${run.id}`"
                                            class="link link-hover font-mono text-sm"
                                            @click.stop
                                        >
                                            {{ run.id }}
                                        </RouterLink>
                                    </td>
                                    <td>{{ kindLabel(run.kind) }}</td>
                                    <td><StatusPill :status="run.status" /></td>
                                    <td>{{ run.serviceName ?? "-" }}</td>
                                    <td class="whitespace-nowrap text-sm text-base-content/80">
                                        {{ formatTimestamp(run.startedAt ?? run.createdAt) }}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div v-if="paginatedRuns.length > 0" class="flex items-center justify-end gap-2">
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
    </PageLayout>
</template>
