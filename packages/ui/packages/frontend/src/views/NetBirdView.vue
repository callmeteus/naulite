<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();

const hasNetBirdData = () =>
    (store.netBirdTopology?.groups.length ?? 0) > 0 ||
    (store.netBirdTopology?.devices.length ?? 0) > 0 ||
    store.netBirdDevices.length > 0 ||
    store.netBirdGroups.length > 0 ||
    store.netBirdAcls.length > 0;

onMounted(() => {
    void store.refreshNetBird();
});
</script>

<template>
    <PageLayout title-key="pages.netbird.title" hint-key="pages.netbird.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && !hasNetBirdData()"
            title-key="pages.netbird.emptyTitle"
            description-key="pages.netbird.emptyDescription"
        />

        <div v-else-if="!store.error" class="grid gap-6 lg:grid-cols-2">
            <div class="card bg-base-100 shadow">
                <div class="card-body">
                    <h3 class="card-title text-base">
                        {{ t("pages.netbird.topology") }}
                    </h3>
                    <p>{{ t("pages.netbird.groupsCount") }}: {{ store.netBirdTopology?.groups.length ?? 0 }}</p>
                    <p>{{ t("pages.netbird.devicesCount") }}: {{ store.netBirdTopology?.devices.length ?? 0 }}</p>
                </div>
            </div>

            <div class="card bg-base-100 shadow lg:col-span-2">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <h3 class="px-6 pt-6 text-lg font-semibold sm:px-0 sm:pt-0">
                        {{ t("pages.netbird.devices") }}
                    </h3>
                    <table class="table table-zebra mt-4">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.name") }}</th>
                                <th>{{ t("common.tableColumns.connected") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="device in store.netBirdDevices" :key="device.id">
                                <td>{{ device.id }}</td>
                                <td>{{ device.name }}</td>
                                <td>{{ device.connected ?? "-" }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <h3 class="px-6 pt-6 text-lg font-semibold sm:px-0 sm:pt-0">
                        {{ t("pages.netbird.groups") }}
                    </h3>
                    <table class="table table-zebra mt-4">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.name") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="group in store.netBirdGroups" :key="group.id">
                                <td>{{ group.id }}</td>
                                <td>{{ group.name }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <h3 class="px-6 pt-6 text-lg font-semibold sm:px-0 sm:pt-0">
                        {{ t("pages.netbird.acls") }}
                    </h3>
                    <table class="table table-zebra mt-4">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.name") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="acl in store.netBirdAcls" :key="acl.id">
                                <td>{{ acl.id }}</td>
                                <td>{{ acl.name ?? "-" }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </PageLayout>
</template>
