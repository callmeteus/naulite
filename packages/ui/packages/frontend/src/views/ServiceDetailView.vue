<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type { FunctionRunSummary, GatewayRouteSummary, Instance, Service } from "@naulite/sdk";

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
import { formatServiceReconcileError } from "../utils/formatReconcileResults";

enum ServiceDetailTab {
    OVERVIEW = "overview",
    CONFIGURATION = "configuration",
    INSTANCES = "instances",
    INGRESS = "ingress",
    FUNCTIONS = "functions"
}

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const service = ref<Service | null>(null);
const instances = ref<Instance[]>([]);
const gatewayRoutes = ref<GatewayRouteSummary[]>([]);
const functionRuns = ref<FunctionRunSummary[]>([]);
const loading = ref(true);
const loadError = ref<ParsedApiError | null>(null);
const actionMessage = ref("");
const actionError = ref<ParsedApiError | null>(null);
const redispatching = ref(false);
const stopping = ref(false);
const restarting = ref(false);
const deleting = ref(false);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const serviceName = computed(() => String(route.params.name ?? ""));
const canWrite = computed(() => auth.hasPermission("workloads:write"));
const canEdit = computed(() => auth.hasPermission("manifests:apply"));

const editManifestHref = computed(() => `/services/${encodeURIComponent(serviceName.value)}/edit`);

const stoppableInstances = computed(() =>
    instances.value.filter((entry) =>
        entry.status === "running"
        || entry.status === "starting"
        || entry.status === "pulling"
        || entry.status === "creating"
    )
);

const runningInstances = computed(() =>
    instances.value.filter((entry) => entry.status === "running")
);

const canStop = computed(() => stoppableInstances.value.length > 0);
const canRestart = computed(() => runningInstances.value.length > 0);

const lifecycleBusy = computed(() =>
    stopping.value || restarting.value || deleting.value || redispatching.value
);

const activeTab = computed({
    get(): ServiceDetailTab {
        const tab = String(route.query.tab ?? ServiceDetailTab.OVERVIEW);

        if (tab === ServiceDetailTab.CONFIGURATION) {
            return ServiceDetailTab.CONFIGURATION;
        }

        if (tab === ServiceDetailTab.INSTANCES) {
            return ServiceDetailTab.INSTANCES;
        }

        if (tab === ServiceDetailTab.INGRESS && showIngressTab.value) {
            return ServiceDetailTab.INGRESS;
        }

        if (tab === ServiceDetailTab.FUNCTIONS && showFunctionsTab.value) {
            return ServiceDetailTab.FUNCTIONS;
        }

        return ServiceDetailTab.OVERVIEW;
    },

    set(tab: ServiceDetailTab) {
        void router.replace({
            path: route.path,
            query: {
                ...route.query,
                tab
            }
        });
    }
});

const runningCount = computed(() =>
    instances.value.filter((entry) => entry.status === "running").length
);

const healthyCount = computed(() =>
    instances.value.filter((entry) => entry.health?.healthy).length
);

const showIngressTab = computed(() =>
    Boolean(service.value?.ingress)
    || gatewayRoutes.value.some((entry) => entry.serviceName === serviceName.value)
);

const showFunctionsTab = computed(() => Boolean(service.value?.functionSpec));

const tabs = computed(() => {
    const items = [
        { id: ServiceDetailTab.OVERVIEW, labelKey: "pages.serviceDetail.tabOverview" },
        { id: ServiceDetailTab.CONFIGURATION, labelKey: "pages.serviceDetail.tabConfiguration" },
        { id: ServiceDetailTab.INSTANCES, labelKey: "pages.serviceDetail.tabInstances", count: instances.value.length }
    ];

    if (showIngressTab.value) {
        items.push({ id: ServiceDetailTab.INGRESS, labelKey: "pages.serviceDetail.tabIngress" });
    }

    if (showFunctionsTab.value) {
        items.push({ id: ServiceDetailTab.FUNCTIONS, labelKey: "pages.serviceDetail.tabFunctions" });
    }

    return items;
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
 * Loads service detail and related resources.
 *
 * @returns Nothing.
 */
async function loadServiceDetail(): Promise<void> {
    loading.value = true;
    loadError.value = null;

    try {
        const [loadedService, loadedInstances, loadedRoutes] = await Promise.all([
            nauliteClient.getService(serviceName.value),
            nauliteClient.listInstances({ serviceName: serviceName.value }),
            nauliteClient.listGatewayRoutes()
        ]);

        service.value = loadedService;
        instances.value = loadedInstances;
        gatewayRoutes.value = loadedRoutes.filter((entry) => entry.serviceName === serviceName.value);

        if (loadedService.functionSpec) {
            try {
                const runs = await nauliteClient.listFunctionRuns(serviceName.value, { page: 1, limit: 20 });
                functionRuns.value = runs.items;
            } catch {
                functionRuns.value = [];
            }
        } else {
            functionRuns.value = [];
        }
    } catch (err) {
        service.value = null;
        instances.value = [];
        gatewayRoutes.value = [];
        functionRuns.value = [];
        loadError.value = parseApiError(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Manually re-dispatches pending or failed instances for the service.
 *
 * @returns Nothing.
 */
async function redispatchService(): Promise<void> {
    if (!service.value) {
        return;
    }

    actionMessage.value = "";
    actionError.value = null;
    redispatching.value = true;

    try {
        const result = await store.reconcileService(service.value.name);
        const dispatched = result.results.some((entry) => entry.status === "dispatched");

        if (dispatched) {
            actionMessage.value = t("pages.services.redispatchSuccess");
        } else {
            actionError.value = {
                message: formatServiceReconcileError(
                    result,
                    t("pages.services.redispatchFailed"),
                    t("pages.services.redispatchNoTargets"),
                    t
                ) ?? t("pages.services.redispatchFailed")
            };
        }

        await loadServiceDetail();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        redispatching.value = false;
    }
}

/**
 * Resets action feedback before lifecycle operations.
 *
 * @returns Nothing.
 */
function resetActionFeedback(): void {
    actionMessage.value = "";
    actionError.value = null;
}

/**
 * Stops every running replica for the service.
 *
 * @returns Nothing.
 */
async function stopService(): Promise<void> {
    if (!canStop.value) {
        return;
    }

    resetActionFeedback();
    stopping.value = true;

    try {
        const failures: string[] = [];

        for (const instance of stoppableInstances.value) {
            const result = await nauliteClient.stopInstance(instance.id);

            if (result.status !== "dispatched") {
                failures.push(result.message ?? instance.id);
            }
        }

        if (failures.length === 0) {
            actionMessage.value = t("pages.serviceDetail.stopSuccess");
        } else
        if (failures.length === stoppableInstances.value.length) {
            actionError.value = {
                message: t("pages.serviceDetail.stopFailed")
            };
        } else {
            actionError.value = {
                message: t("pages.serviceDetail.partialActionFailure", {
                    details: failures.join("; ")
                })
            };
        }

        await loadServiceDetail();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        stopping.value = false;
    }
}

/**
 * Restarts every running replica for the service.
 *
 * @returns Nothing.
 */
async function restartService(): Promise<void> {
    if (!canRestart.value) {
        return;
    }

    resetActionFeedback();
    restarting.value = true;

    try {
        const failures: string[] = [];

        for (const instance of runningInstances.value) {
            const result = await nauliteClient.restartInstance(instance.id);

            if (result.status !== "dispatched") {
                failures.push(result.message ?? instance.id);
            }
        }

        if (failures.length === 0) {
            actionMessage.value = t("pages.serviceDetail.restartSuccess");
        } else
        if (failures.length === runningInstances.value.length) {
            actionError.value = {
                message: t("pages.serviceDetail.restartFailed")
            };
        } else {
            actionError.value = {
                message: t("pages.serviceDetail.partialActionFailure", {
                    details: failures.join("; ")
                })
            };
        }

        await loadServiceDetail();
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        restarting.value = false;
    }
}

/**
 * Opens the delete confirmation modal.
 *
 * @returns Nothing.
 */
function openDeleteModal(): void {
    deleteModalRef.value?.open();
}

/**
 * Deletes the service from the cluster.
 *
 * @returns Nothing.
 */
async function confirmDeleteService(): Promise<void> {
    if (!service.value) {
        return;
    }

    resetActionFeedback();
    deleting.value = true;

    try {
        await store.deleteService(service.value.name);
        await router.push("/services");
    } catch (err) {
        actionError.value = parseApiError(err);
    } finally {
        deleting.value = false;
    }
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

onMounted(() => {
    void loadServiceDetail();
});

watch(serviceName, () => {
    void loadServiceDetail();
});
</script>

<template>
    <PageLayout
        title-key="pages.services.title"
        :title="service?.name ?? serviceName"
        hint-key="pages.serviceDetail.hint"
    >
        <template #actions>
            <RouterLink to="/services" class="btn btn-ghost btn-sm">
                {{ t("pages.serviceDetail.back") }}
            </RouterLink>
            <RouterLink
                v-if="canEdit && service"
                :to="editManifestHref"
                class="btn btn-outline btn-sm"
            >
                {{ t("pages.serviceDetail.edit") }}
            </RouterLink>
            <button
                v-if="canWrite && service"
                type="button"
                class="btn btn-error btn-outline btn-sm"
                :disabled="lifecycleBusy"
                @click="openDeleteModal"
            >
                {{
                    deleting
                        ? t("pages.serviceDetail.deleting")
                        : t("pages.serviceDetail.delete")
                }}
            </button>
        </template>

        <ErrorAlert :error="loadError || actionError" />

        <p v-if="actionMessage" class="alert alert-success">
            {{ actionMessage }}
        </p>

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <p v-else-if="!loadError && !service" class="text-base-content/70">
            {{ t("pages.serviceDetail.notFound") }}
        </p>

        <div v-else-if="service" class="space-y-6">
            <div class="flex flex-wrap items-center gap-2">
                <StatusPill :status="service.status" />
                <StatusPill v-if="service.lifecycleStatus" :status="service.lifecycleStatus" />
            </div>

            <div class="tabs tabs-boxed w-fit">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    type="button"
                    class="tab"
                    :class="{ 'tab-active': activeTab === tab.id }"
                    @click="activeTab = tab.id"
                >
                    {{ t(tab.labelKey) }}
                    <span v-if="tab.count !== undefined" class="ml-1 opacity-70">({{ tab.count }})</span>
                </button>
            </div>

            <div v-if="activeTab === ServiceDetailTab.OVERVIEW" class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <MetadataGrid>
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.manifest')"
                            :value="service.manifestName"
                        />
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.desiredReplicas')"
                            :value="service.desiredReplicas"
                        />
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.runningReplicas')"
                            :value="runningCount"
                        />
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.healthyReplicas')"
                            :value="healthyCount"
                        />
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.image')"
                            span="full"
                        >
                            <code class="text-xs">{{ service.image }}</code>
                        </MetadataGridItem>
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.createdAt')"
                            :value="formatTimestamp(service.createdAt)"
                        />
                        <MetadataGridItem
                            :label="t('pages.serviceDetail.updatedAt')"
                            :value="formatTimestamp(service.updatedAt)"
                        />
                    </MetadataGrid>

                    <div v-if="canWrite" class="flex flex-wrap gap-2">
                        <button
                            v-if="canRedispatchService(service.status)"
                            type="button"
                            class="btn btn-primary btn-sm"
                            :disabled="lifecycleBusy"
                            @click="redispatchService"
                        >
                            {{
                                redispatching
                                    ? t("pages.services.redispatching")
                                    : t("pages.services.redispatch")
                            }}
                        </button>
                        <button
                            v-if="canStop"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="stopService"
                        >
                            {{
                                stopping
                                    ? t("pages.serviceDetail.stopping")
                                    : t("pages.serviceDetail.stop")
                            }}
                        </button>
                        <button
                            v-if="canRestart"
                            type="button"
                            class="btn btn-outline btn-sm"
                            :disabled="lifecycleBusy"
                            @click="restartService"
                        >
                            {{
                                restarting
                                    ? t("pages.serviceDetail.restarting")
                                    : t("pages.serviceDetail.restart")
                            }}
                        </button>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === ServiceDetailTab.CONFIGURATION" class="card bg-base-100 shadow">
                <div class="card-body gap-6">
                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.ports") }}</h3>
                        <p v-if="!service.deploySpec?.ports?.length" class="text-sm text-base-content/70">-</p>
                        <ul v-else class="mt-2 space-y-1 text-sm">
                            <li v-for="(port, index) in service.deploySpec.ports" :key="index">
                                {{ port.containerPort }}/{{ port.protocol }}
                                <span v-if="port.hostPort"> (host {{ port.hostPort }})</span>
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.environment") }}</h3>
                        <p v-if="!Object.keys(service.deploySpec?.environment ?? {}).length" class="text-sm text-base-content/70">-</p>
                        <ul v-else class="mt-2 space-y-1 font-mono text-xs">
                            <li v-for="(value, key) in service.deploySpec?.environment" :key="key">
                                {{ key }}={{ value }}
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.volumeMounts") }}</h3>
                        <p v-if="!service.deploySpec?.volumeMounts?.length" class="text-sm text-base-content/70">-</p>
                        <ul v-else class="mt-2 space-y-1 text-sm">
                            <li v-for="(mount, index) in service.deploySpec.volumeMounts" :key="index">
                                {{ mount.volumeName }} → {{ mount.mountPath }}
                            </li>
                        </ul>
                    </section>

                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.networks") }}</h3>
                        <p class="text-sm">{{ service.networks?.length ? service.networks.join(", ") : "-" }}</p>
                    </section>

                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.capabilities") }}</h3>
                        <p class="text-sm">{{ service.capabilities?.length ? service.capabilities.join(", ") : "-" }}</p>
                    </section>
                </div>
            </div>

            <div v-else-if="activeTab === ServiceDetailTab.INSTANCES" class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.node") }}</th>
                                <th>{{ t("common.status") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="instance in instances"
                                :key="instance.id"
                                class="cursor-pointer hover:bg-base-200/60"
                                @click="router.push(`/instances/${instance.id}`)"
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
                                <td>{{ instance.nodeId }}</td>
                                <td><StatusPill :status="instance.status" /></td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div v-else-if="activeTab === ServiceDetailTab.INGRESS" class="card bg-base-100 shadow">
                <div class="card-body gap-4">
                    <section v-if="service.ingress">
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.ingressConfig") }}</h3>
                        <pre class="mt-2 overflow-auto rounded-box bg-base-300 p-3 text-xs">{{ JSON.stringify(service.ingress, null, 2) }}</pre>
                    </section>

                    <section>
                        <h3 class="font-semibold">{{ t("pages.serviceDetail.gatewayRoutes") }}</h3>
                        <p v-if="gatewayRoutes.length === 0" class="text-sm text-base-content/70">-</p>
                        <ul v-else class="mt-2 space-y-2 text-sm">
                            <li v-for="routeEntry in gatewayRoutes" :key="routeEntry.id">
                                <RouterLink to="/gateway-routes" class="link link-primary">
                                    {{ routeEntry.host }}
                                </RouterLink>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>

            <div v-else-if="activeTab === ServiceDetailTab.FUNCTIONS" class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.status") }}</th>
                                <th>{{ t("pages.serviceDetail.startedAt") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="run in functionRuns" :key="run.id">
                                <td class="font-mono text-sm">{{ run.id }}</td>
                                <td><StatusPill :status="run.status" /></td>
                                <td>{{ formatTimestamp(run.startedAt) }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <ConfirmModal
            ref="deleteModalRef"
            title-key="pages.serviceDetail.deleteTitle"
            message-key="pages.serviceDetail.deleteMessage"
            confirm-label-key="common.delete"
            :danger="true"
            :handler="confirmDeleteService"
        />
    </PageLayout>
</template>
