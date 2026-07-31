<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const router = useRouter();
const store = useClusterStore();

onMounted(() => {
    void store.refreshInstances();
});

/**
 * Opens the instance detail page.
 *
 * @param id Instance identifier
 * @returns Nothing.
 */
function openInstance(id: string): void {
    void router.push(`/instances/${id}`);
}
</script>

<template>
    <PageLayout title-key="pages.instances.title" hint-key="pages.instances.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.instances.length === 0"
            title-key="pages.instances.emptyTitle"
            description-key="pages.instances.emptyDescription"
            action-label-key="pages.instances.emptyAction"
            action-to="/services"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.id") }}</th>
                            <th>{{ t("common.tableColumns.service") }}</th>
                            <th>{{ t("common.tableColumns.node") }}</th>
                            <th>{{ t("common.status") }}</th>
                            <th>{{ t("common.tableColumns.image") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr
                            v-for="instance in store.instances"
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
                            <td>{{ instance.serviceName }}</td>
                            <td>
                                <RouterLink
                                    :to="`/nodes/${instance.nodeId}`"
                                    class="link link-hover"
                                    @click.stop
                                >
                                    {{ instance.nodeId }}
                                </RouterLink>
                            </td>
                            <td><StatusPill :status="instance.status" /></td>
                            <td><code class="text-xs">{{ instance.image }}</code></td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </PageLayout>
</template>
