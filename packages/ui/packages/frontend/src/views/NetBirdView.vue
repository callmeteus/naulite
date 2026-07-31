<script setup lang="ts">
import { Network, Router as RouterIcon, Server } from "@lucide/vue";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink } from "vue-router";

import type { NetBirdAcl, NetBirdDevice, NetBirdGroup, Node } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { parseApiError, type ParsedApiError } from "../composables/useApiAction";
import {
    countOnlineNetBirdDevices,
    findLinkedNode,
    formatNetBirdAclPorts,
    formatNetBirdGroupRefs,
    isNetBirdDeviceOnline,
    listUnlinkedNodes,
    resolveNetBirdGroupName
} from "../utils/netbirdPresentation";

enum NetBirdTab {
    OVERVIEW = "overview",
    DEVICES = "devices",
    GROUPS = "groups",
    ACCESS_RULES = "access-rules"
}

const { t, locale } = useI18n();

const loading = ref(true);
const error = ref<ParsedApiError | null>(null);
const activeTab = ref<NetBirdTab>(NetBirdTab.OVERVIEW);
const devices = ref<NetBirdDevice[]>([]);
const groups = ref<NetBirdGroup[]>([]);
const acls = ref<NetBirdAcl[]>([]);
const nodes = ref<Node[]>([]);
const lastRefreshedAt = ref<Date | null>(null);

const onlineDevices = computed(() => countOnlineNetBirdDevices(devices.value));
const unlinkedNodes = computed(() => listUnlinkedNodes(nodes.value));
const meshConfigured = computed(() =>
    groups.value.length > 0 || devices.value.length > 0 || acls.value.length > 0
);

const meshStatusKey = computed(() => {
    if (!meshConfigured.value) {
        return "pages.netbird.statusNotConfigured";
    }

    if (devices.value.length === 0) {
        return "pages.netbird.statusNoDevices";
    }

    if (onlineDevices.value === 0) {
        return "pages.netbird.statusDevicesOffline";
    }

    if (unlinkedNodes.value.length > 0) {
        return "pages.netbird.statusPartialEnrollment";
    }

    return "pages.netbird.statusHealthy";
});

const meshStatusTone = computed(() => {
    if (!meshConfigured.value) {
        return "border-base-300 bg-base-200/40";
    }

    if (devices.value.length === 0 || onlineDevices.value === 0) {
        return "border-warning/30 bg-warning/10";
    }

    if (unlinkedNodes.value.length > 0) {
        return "border-warning/30 bg-warning/10";
    }

    return "border-success/30 bg-success/10";
});

const lastUpdatedLabel = computed(() => {
    if (!lastRefreshedAt.value) {
        return "";
    }

    return new Intl.DateTimeFormat(locale.value, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    }).format(lastRefreshedAt.value);
});

const tabs = computed(() => [
    { id: NetBirdTab.OVERVIEW, labelKey: "pages.netbird.tabOverview" },
    { id: NetBirdTab.DEVICES, labelKey: "pages.netbird.tabDevices", count: devices.value.length },
    { id: NetBirdTab.GROUPS, labelKey: "pages.netbird.tabGroups", count: groups.value.length },
    { id: NetBirdTab.ACCESS_RULES, labelKey: "pages.netbird.tabAccessRules", count: acls.value.length }
]);

onMounted(() => {
    void refresh();
});

/**
 * Reloads NetBird inventory and cluster node links.
 *
 * @returns Nothing.
 */
async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
        const [
            topologyResponse,
            deviceList,
            groupList,
            aclList,
            nodeList
        ] = await Promise.all([
            nauliteClient.getNetBirdTopology(),
            nauliteClient.listNetBirdDevices(),
            nauliteClient.listNetBirdGroups(),
            nauliteClient.listNetBirdAcls(),
            nauliteClient.listNodes()
        ]);

        devices.value = deviceList.length > 0 ? deviceList : topologyResponse.devices ?? [];
        groups.value = groupList.length > 0 ? groupList : topologyResponse.groups ?? [];
        acls.value = aclList.length > 0 ? aclList : topologyResponse.acls ?? [];
        nodes.value = nodeList;
        lastRefreshedAt.value = new Date();
    } catch (err) {
        error.value = parseApiError(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Resolves group membership labels for a device.
 *
 * @param device NetBird device
 * @returns Comma-separated group names
 */
function formatDeviceGroups(device: NetBirdDevice): string {
    if (!Array.isArray(device.groups) || device.groups.length === 0) {
        return "-";
    }

    return device.groups
        .map((groupId) => resolveNetBirdGroupName(groupId, groups.value))
        .join(", ");
}

/**
 * Resolves the cluster node linked to a device.
 *
 * @param deviceId NetBird device id
 * @returns Linked node or undefined
 */
function linkedNodeForDevice(deviceId: string): Node | undefined {
    return findLinkedNode(deviceId, nodes.value);
}
</script>

<template>
    <PageLayout title-key="pages.netbird.title" hint-key="pages.netbird.hint">
        <template #actions>
            <span v-if="lastUpdatedLabel" class="self-center text-xs text-base-content/60">
                {{ t("pages.netbird.lastUpdated", { time: lastUpdatedLabel }) }}
            </span>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :class="{ loading }"
                :disabled="loading"
                @click="refresh"
            >
                {{ t("pages.netbird.refresh") }}
            </button>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="loading && !meshConfigured" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && !loading && !meshConfigured"
            title-key="pages.netbird.emptyTitle"
            description-key="pages.netbird.emptyDescription"
            action-label-key="pages.netbird.emptyAction"
            :icon="Network"
            @action="refresh"
        />

        <div v-else-if="!error" class="flex flex-col gap-6">
            <div class="alert text-sm" :class="meshStatusTone">
                <div class="flex w-full flex-wrap items-center justify-between gap-3">
                    <span>{{ t(meshStatusKey, { count: unlinkedNodes.length }) }}</span>
                    <RouterLink
                        v-if="unlinkedNodes.length > 0"
                        to="/nodes"
                        class="btn btn-ghost btn-sm"
                    >
                        {{ t("pages.netbird.viewNodes") }}
                    </RouterLink>
                </div>
            </div>

            <div class="tabs tabs-boxed w-fit">
                <button
                    v-for="tab in tabs"
                    :key="tab.id"
                    type="button"
                    class="tab gap-2"
                    :class="{ 'tab-active': activeTab === tab.id }"
                    @click="activeTab = tab.id"
                >
                    <span>{{ t(tab.labelKey) }}</span>
                    <span
                        v-if="tab.count !== undefined"
                        class="badge badge-sm"
                        :class="activeTab === tab.id ? 'badge-primary' : 'badge-ghost'"
                    >
                        {{ tab.count }}
                    </span>
                </button>
            </div>

            <div v-if="activeTab === NetBirdTab.OVERVIEW" class="stats w-full bg-base-100 shadow lg:stats-horizontal">
                <div class="stat">
                    <div class="stat-figure text-primary">
                        <RouterIcon class="size-6" />
                    </div>
                    <div class="stat-title">{{ t("pages.netbird.statDevices") }}</div>
                    <div class="stat-value text-2xl">{{ devices.length }}</div>
                    <div class="stat-desc">
                        {{ t("pages.netbird.statDevicesOnline", { count: onlineDevices }) }}
                    </div>
                </div>

                <div class="stat">
                    <div class="stat-figure text-secondary">
                        <Network class="size-6" />
                    </div>
                    <div class="stat-title">{{ t("pages.netbird.statGroups") }}</div>
                    <div class="stat-value text-2xl">{{ groups.length }}</div>
                    <div class="stat-desc">{{ t("pages.netbird.statGroupsHint") }}</div>
                </div>

                <div class="stat">
                    <div class="stat-title">{{ t("pages.netbird.statAcls") }}</div>
                    <div class="stat-value text-2xl">{{ acls.length }}</div>
                    <div class="stat-desc">{{ t("pages.netbird.statAclsHint") }}</div>
                </div>

                <div class="stat">
                    <div class="stat-figure text-accent">
                        <Server class="size-6" />
                    </div>
                    <div class="stat-title">{{ t("pages.netbird.statLinkedNodes") }}</div>
                    <div class="stat-value text-2xl">{{ nodes.length - unlinkedNodes.length }}</div>
                    <div class="stat-desc">
                        {{ t("pages.netbird.statLinkedNodesHint", { total: nodes.length }) }}
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === NetBirdTab.DEVICES" class="space-y-6">
                <EmptyState
                    v-if="devices.length === 0"
                    title-key="pages.netbird.devicesEmptyTitle"
                    description-key="pages.netbird.devicesEmptyDescription"
                    action-label-key="pages.netbird.viewNodes"
                    action-to="/nodes"
                    :icon="RouterIcon"
                />

                <div v-else class="card bg-base-100 shadow">
                    <div class="card-body overflow-x-auto p-0 sm:p-6">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.tableColumns.name") }}</th>
                                    <th>{{ t("common.tableColumns.hostname") }}</th>
                                    <th>{{ t("common.status") }}</th>
                                    <th>{{ t("pages.netbird.linkedNode") }}</th>
                                    <th>{{ t("pages.netbird.groups") }}</th>
                                    <th>{{ t("common.id") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="device in devices" :key="device.id">
                                    <td class="font-medium">{{ device.name }}</td>
                                    <td>{{ device.hostname ?? "-" }}</td>
                                    <td>
                                        <StatusPill
                                            :status="isNetBirdDeviceOnline(device) ? 'online' : 'offline'"
                                        />
                                    </td>
                                    <td>
                                        <RouterLink
                                            v-if="linkedNodeForDevice(device.id)"
                                            :to="`/nodes/${linkedNodeForDevice(device.id)!.id}`"
                                            class="link link-primary"
                                        >
                                            {{ linkedNodeForDevice(device.id)!.id }}
                                        </RouterLink>
                                        <span v-else class="text-base-content/60">
                                            {{ t("pages.netbird.unlinked") }}
                                        </span>
                                    </td>
                                    <td>{{ formatDeviceGroups(device) }}</td>
                                    <td class="font-mono text-xs">{{ device.id }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <section v-if="unlinkedNodes.length > 0" class="space-y-3">
                    <div>
                        <h2 class="text-lg font-semibold">{{ t("pages.netbird.unlinkedNodesTitle") }}</h2>
                        <p class="text-sm text-base-content/70">{{ t("pages.netbird.unlinkedNodesHint") }}</p>
                    </div>

                    <div class="card bg-base-100 shadow">
                        <div class="card-body overflow-x-auto p-0 sm:p-6">
                            <table class="table table-zebra">
                                <thead>
                                    <tr>
                                        <th>{{ t("common.id") }}</th>
                                        <th>{{ t("common.tableColumns.hostname") }}</th>
                                        <th>{{ t("common.status") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="node in unlinkedNodes" :key="node.id">
                                        <td>
                                            <RouterLink :to="`/nodes/${node.id}`" class="link link-primary">
                                                {{ node.id }}
                                            </RouterLink>
                                        </td>
                                        <td>{{ node.hostname }}</td>
                                        <td>
                                            <StatusPill :status="node.status" />
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>

            <div v-else-if="activeTab === NetBirdTab.GROUPS">
                <EmptyState
                    v-if="groups.length === 0"
                    title-key="pages.netbird.groupsEmptyTitle"
                    description-key="pages.netbird.groupsEmptyDescription"
                />

                <div v-else class="card bg-base-100 shadow">
                    <div class="card-body overflow-x-auto p-0 sm:p-6">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.tableColumns.name") }}</th>
                                    <th>{{ t("pages.netbird.peerCount") }}</th>
                                    <th>{{ t("common.id") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="group in groups" :key="group.id">
                                    <td class="font-medium">{{ group.name }}</td>
                                    <td>{{ group.peers?.length ?? 0 }}</td>
                                    <td class="font-mono text-xs">{{ group.id }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div v-else-if="activeTab === NetBirdTab.ACCESS_RULES">
                <EmptyState
                    v-if="acls.length === 0"
                    title-key="pages.netbird.aclsEmptyTitle"
                    description-key="pages.netbird.aclsEmptyDescription"
                />

                <div v-else class="card bg-base-100 shadow">
                    <div class="card-body overflow-x-auto p-0 sm:p-6">
                        <table class="table table-zebra">
                            <thead>
                                <tr>
                                    <th>{{ t("common.tableColumns.name") }}</th>
                                    <th>{{ t("pages.netbird.protocol") }}</th>
                                    <th>{{ t("pages.netbird.ports") }}</th>
                                    <th>{{ t("pages.netbird.sourceGroups") }}</th>
                                    <th>{{ t("pages.netbird.destinationGroups") }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="acl in acls" :key="acl.id">
                                    <td class="font-medium">{{ acl.name ?? acl.id }}</td>
                                    <td>{{ (acl.protocol ?? "tcp").toUpperCase() }}</td>
                                    <td>
                                        {{
                                            formatNetBirdAclPorts(acl) === "all"
                                                ? t("pages.netbird.allPorts")
                                                : formatNetBirdAclPorts(acl)
                                        }}
                                    </td>
                                    <td>{{ formatNetBirdGroupRefs(acl.sourceGroups, groups) }}</td>
                                    <td>{{ formatNetBirdGroupRefs(acl.destinationGroups, groups) }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
