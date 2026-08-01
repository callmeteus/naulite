<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";
import type { NotificationDestination, NotificationTestResult } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const route = useRoute();
const auth = useAuthStore();
const destinations = ref<NotificationDestination[]>([]);
const testResults = ref<NotificationTestResult[]>([]);
const loading = ref(false);
const testingAll = ref(false);
const testingDestinationId = ref("");
const deleting = ref(false);
const error = ref("");
const message = ref("");
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const deleteTarget = ref<NotificationDestination | null>(null);

const canWrite = computed(() => auth.hasPermission("notifications:write"));

/**
 * Loads notification destinations from the admin API.
 *
 * @returns Nothing.
 */
async function refreshDestinations(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        const response = await nauliteClient.listNotificationDestinations();
        destinations.value = response.destinations;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Opens the delete confirmation modal.
 *
 * @param destination Destination to delete
 * @returns Nothing.
 */
function openDeleteModal(destination: NotificationDestination): void {
    deleteTarget.value = destination;
    deleteModalRef.value?.open();
}

/**
 * Deletes the selected destination.
 *
 * @returns Nothing.
 */
async function confirmDelete(): Promise<void> {
    if (!deleteTarget.value) {
        return;
    }

    deleting.value = true;
    error.value = "";
    message.value = "";

    try {
        await nauliteClient.deleteNotificationDestination(deleteTarget.value.id);
        message.value = t("pages.notifications.deleted");
        deleteTarget.value = null;
        await refreshDestinations();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        deleting.value = false;
    }
}

/**
 * Sends a test notification to every enabled destination.
 *
 * @returns Nothing.
 */
async function sendTestAll(): Promise<void> {
    testingAll.value = true;
    error.value = "";
    testResults.value = [];

    try {
        const response = await nauliteClient.testNotificationProviders();
        testResults.value = response.destinations;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        testingAll.value = false;
    }
}

/**
 * Sends a test notification to a single destination.
 *
 * @param destinationId Destination identifier
 * @returns Nothing.
 */
async function sendTestDestination(destinationId: string): Promise<void> {
    testingDestinationId.value = destinationId;
    error.value = "";

    try {
        const result = await nauliteClient.testNotificationDestination(destinationId);
        testResults.value = [result];
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        testingDestinationId.value = "";
    }
}

/**
 * Returns a human-readable label for a destination type.
 *
 * @param type Destination type
 * @returns Display label
 */
function destinationTypeLabel(type: NotificationDestination["type"]): string {
    return type === "SLACK"
        ? t("pages.notifications.typeSlack")
        : t("pages.notifications.typeWebhook");
}

/**
 * Returns a short summary for destination event filters.
 *
 * @param destination Notification destination
 * @returns Filter summary
 */
function filterSummary(destination: NotificationDestination): string {
    if (destination.allowedKinds.length === 0) {
        return t("pages.notifications.filtersAll");
    }

    return t("pages.notifications.filtersCount", { count: destination.allowedKinds.length });
}

/**
 * Resolves a destination name for a test result identifier.
 *
 * @param destinationId Destination identifier
 * @returns Display name
 */
function destinationNameForResult(destinationId: string): string {
    return destinations.value.find((entry) => entry.id === destinationId)?.name ?? destinationId;
}

onMounted(() => {
    if (route.query.saved === "1") {
        message.value = t("pages.notifications.saved");
    }

    void refreshDestinations();
});
</script>

<style scoped>
.destination-grid {
    display: grid;
    gap: 1rem;
}
</style>

<template>
    <PageLayout title-key="pages.notifications.title" hint-key="pages.notifications.hint">
        <template #actions>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="loading"
                @click="refreshDestinations"
            >
                {{ t("pages.notifications.refresh") }}
            </button>
            <button
                v-if="canWrite"
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="testingAll || destinations.length === 0"
                @click="sendTestAll"
            >
                {{ testingAll ? t("pages.notifications.testing") : t("pages.notifications.testAll") }}
            </button>
            <RouterLink
                v-if="canWrite"
                to="/notifications/new"
                class="btn btn-primary btn-sm"
            >
                {{ t("pages.notifications.addDestination") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="message" class="alert alert-success mb-4">
            <span>{{ message }}</span>
        </div>

        <div v-if="loading && destinations.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && destinations.length === 0"
            title-key="pages.notifications.emptyTitle"
            description-key="pages.notifications.emptyDescription"
            :action-label-key="canWrite ? 'pages.notifications.addDestination' : undefined"
            action-to="/notifications/new"
        />

        <div v-else class="destination-grid">
            <article
                v-for="destination in destinations"
                :key="destination.id"
                class="card bg-base-100 shadow"
            >
                <div class="card-body gap-4">
                    <div class="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h3 class="text-lg font-semibold">
                                    {{ destination.name }}
                                </h3>
                                <span class="badge badge-outline">{{ destinationTypeLabel(destination.type) }}</span>
                                <StatusPill :status="destination.enabled ? 'active' : 'disabled'" />
                            </div>
                            <p class="mt-2 break-all text-sm text-base-content/70">
                                {{ destination.url }}
                            </p>
                            <p class="mt-1 text-xs text-base-content/60">
                                {{ filterSummary(destination) }}
                                <span v-if="destination.secretConfigured"> · {{ t("pages.notifications.secretConfigured") }}</span>
                            </p>
                        </div>

                        <div v-if="canWrite" class="flex flex-wrap gap-2">
                            <button
                                type="button"
                                class="btn btn-ghost btn-sm"
                                :disabled="testingDestinationId === destination.id"
                                @click="sendTestDestination(destination.id)"
                            >
                                {{
                                    testingDestinationId === destination.id
                                        ? t("pages.notifications.testing")
                                        : t("pages.notifications.test")
                                }}
                            </button>
                            <RouterLink
                                :to="`/notifications/${destination.id}/edit`"
                                class="btn btn-ghost btn-sm"
                            >
                                {{ t("common.edit") }}
                            </RouterLink>
                            <button type="button" class="btn btn-ghost btn-sm text-error" @click="openDeleteModal(destination)">
                                {{ t("common.delete") }}
                            </button>
                        </div>
                    </div>
                </div>
            </article>
        </div>

        <div v-if="testResults.length > 0" class="card bg-base-100 shadow mt-4">
            <div class="card-body">
                <h3 class="text-lg font-semibold">
                    {{ t("pages.notifications.testResults") }}
                </h3>
                <ul class="mt-2 space-y-2">
                    <li v-for="result in testResults" :key="result.id" class="text-sm">
                        <strong>{{ destinationNameForResult(result.id) }}</strong>:
                        {{ result.ok ? t("pages.notifications.testOk") : t("pages.notifications.testFailed") }}
                        <span v-if="result.error"> - {{ result.error }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <ConfirmModal
            ref="deleteModalRef"
            title-key="pages.notifications.deleteTitle"
            confirm-label-key="common.delete"
            danger
            @confirm="confirmDelete"
        >
            <p v-if="deleteTarget" class="py-4">
                {{ t("pages.notifications.deleteMessage", { name: deleteTarget.name }) }}
            </p>
        </ConfirmModal>
    </PageLayout>
</template>
