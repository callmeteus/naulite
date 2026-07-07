<script setup lang="ts">
import type {
    CreateNotificationDestinationInput,
    NotificationDestination,
    NotificationTestResult,
    PipelineEventKind,
    UpdateNotificationDestinationInput
} from "@naulite/sdk";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const auth = useAuthStore();
const destinations = ref<NotificationDestination[]>([]);
const testResults = ref<NotificationTestResult[]>([]);
const loading = ref(false);
const testingAll = ref(false);
const testingDestinationId = ref("");
const saving = ref(false);
const deleting = ref(false);
const error = ref("");
const message = ref("");
const formModalRef = ref<HTMLDialogElement | null>(null);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const editingDestination = ref<NotificationDestination | null>(null);
const deleteTarget = ref<NotificationDestination | null>(null);
const formName = ref("");
const formType = ref<"SLACK" | "WEBHOOK">("SLACK");
const formUrl = ref("");
const formSecret = ref("");
const formEnabled = ref(true);
const formAllowedKinds = ref<PipelineEventKind[]>([]);

const eventKindOptions: PipelineEventKind[] = [
    "ci.build.submitted",
    "image.build.started",
    "build.step.started",
    "build.step.finished",
    "image.pushed",
    "rollout.started",
    "rollout.finished",
    "ci.build.finished",
    "ci.pipeline.failed",
    "gitops.sync.started",
    "infra.sync.finished",
    "node.disk_pressure",
    "node.disk_pressure.cleared",
    "node.left_cluster",
    "node.joined_cluster",
    "deploy.step.started",
    "deploy.step.finished",
    "deploy.step.failed"
];

const canWrite = computed(() => auth.hasPermission("notifications:write"));
const formTitle = computed(() => (
    editingDestination.value
        ? t("pages.notifications.editDestination")
        : t("pages.notifications.addDestination")
));

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
 * Opens the create destination modal.
 *
 * @returns Nothing.
 */
function openCreateModal(): void {
    editingDestination.value = null;
    formName.value = "";
    formType.value = "SLACK";
    formUrl.value = "";
    formSecret.value = "";
    formEnabled.value = true;
    formAllowedKinds.value = [];
    formModalRef.value?.showModal();
}

/**
 * Opens the edit destination modal.
 *
 * @param destination Destination to edit
 * @returns Nothing.
 */
function openEditModal(destination: NotificationDestination): void {
    editingDestination.value = destination;
    formName.value = destination.name;
    formType.value = destination.type;
    formUrl.value = destination.url;
    formSecret.value = "";
    formEnabled.value = destination.enabled;
    formAllowedKinds.value = [...destination.allowedKinds];
    formModalRef.value?.showModal();
}

/**
 * Closes the destination form modal.
 *
 * @returns Nothing.
 */
function closeFormModal(): void {
    formModalRef.value?.close();
}

/**
 * Persists the destination form.
 *
 * @returns Nothing.
 */
async function saveDestination(): Promise<void> {
    const trimmedName = formName.value.trim();
    const trimmedUrl = formUrl.value.trim();

    if (!trimmedName || !trimmedUrl) {
        return;
    }

    saving.value = true;
    error.value = "";
    message.value = "";

    try {
        if (editingDestination.value) {
            const payload: UpdateNotificationDestinationInput = {
                name: trimmedName,
                type: formType.value,
                url: trimmedUrl,
                enabled: formEnabled.value,
                allowedKinds: formAllowedKinds.value
            };

            if (formSecret.value.trim()) {
                payload.secret = formSecret.value.trim();
            }

            await nauliteClient.updateNotificationDestination(editingDestination.value.id, payload);
            message.value = t("pages.notifications.updated");
        } else {
            const payload: CreateNotificationDestinationInput = {
                name: trimmedName,
                type: formType.value,
                url: trimmedUrl,
                enabled: formEnabled.value,
                allowedKinds: formAllowedKinds.value
            };

            if (formSecret.value.trim()) {
                payload.secret = formSecret.value.trim();
            }

            await nauliteClient.createNotificationDestination(payload);
            message.value = t("pages.notifications.created");
        }

        closeFormModal();
        await refreshDestinations();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
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
 * Toggles a pipeline event kind in the destination filter selection.
 *
 * @param kind Pipeline event kind
 * @returns Nothing.
 */
function toggleEventKind(kind: PipelineEventKind): void {
    const next = formAllowedKinds.value.includes(kind)
        ? formAllowedKinds.value.filter((entry) => entry !== kind)
        : [...formAllowedKinds.value, kind];

    formAllowedKinds.value = next;
}

/**
 * Selects every pipeline event kind for the destination form.
 *
 * @returns Nothing.
 */
function selectAllEventKinds(): void {
    formAllowedKinds.value = [...eventKindOptions];
}

/**
 * Clears every pipeline event kind for the destination form.
 *
 * @returns Nothing.
 */
function clearEventKinds(): void {
    formAllowedKinds.value = [];
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
    void refreshDestinations();
});
</script>

<template>
    <PageLayout title-key="pages.notifications.title" hint-key="pages.notifications.hint">
        <template #actions>
            <button type="button" class="btn btn-outline btn-sm" :disabled="loading" @click="refreshDestinations">
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
            <button
                v-if="canWrite"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openCreateModal"
            >
                {{ t("pages.notifications.addDestination") }}
            </button>
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
            @action="openCreateModal"
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
                                <h3 class="text-lg font-semibold">{{ destination.name }}</h3>
                                <span class="badge badge-outline">{{ destinationTypeLabel(destination.type) }}</span>
                                <StatusPill :status="destination.enabled ? 'active' : 'disabled'" />
                            </div>
                            <p class="mt-2 break-all text-sm text-base-content/70">{{ destination.url }}</p>
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
                            <button type="button" class="btn btn-ghost btn-sm" @click="openEditModal(destination)">
                                {{ t("common.edit") }}
                            </button>
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
                <h3 class="text-lg font-semibold">{{ t("pages.notifications.testResults") }}</h3>
                <ul class="mt-2 space-y-2">
                    <li v-for="result in testResults" :key="result.id" class="text-sm">
                        <strong>{{ destinationNameForResult(result.id) }}</strong>:
                        {{ result.ok ? t("pages.notifications.testOk") : t("pages.notifications.testFailed") }}
                        <span v-if="result.error"> - {{ result.error }}</span>
                    </li>
                </ul>
            </div>
        </div>

        <dialog ref="formModalRef" class="modal">
            <div class="modal-box max-w-3xl">
                <h3 class="text-lg font-bold">{{ formTitle }}</h3>

                <div class="mt-4 grid gap-4 md:grid-cols-2">
                    <label class="form-control md:col-span-2">
                        <span class="label-text">{{ t("pages.notifications.name") }}</span>
                        <input v-model="formName" type="text" class="input input-bordered" required />
                    </label>

                    <label class="form-control">
                        <span class="label-text">{{ t("pages.notifications.type") }}</span>
                        <select v-model="formType" class="select select-bordered">
                            <option value="SLACK">{{ t("pages.notifications.typeSlack") }}</option>
                            <option value="WEBHOOK">{{ t("pages.notifications.typeWebhook") }}</option>
                        </select>
                    </label>

                    <label class="form-control">
                        <span class="label-text">{{ t("pages.notifications.enabled") }}</span>
                        <input v-model="formEnabled" type="checkbox" class="toggle toggle-primary mt-2" />
                    </label>

                    <label class="form-control md:col-span-2">
                        <span class="label-text">{{ t("pages.notifications.webhookUrl") }}</span>
                        <input
                            v-model="formUrl"
                            type="url"
                            class="input input-bordered"
                            :placeholder="t('pages.notifications.webhookUrlPlaceholder')"
                            required
                        />
                    </label>

                    <label v-if="formType === 'WEBHOOK'" class="form-control md:col-span-2">
                        <span class="label-text">{{ t("pages.notifications.webhookSecret") }}</span>
                        <input
                            v-model="formSecret"
                            type="password"
                            class="input input-bordered"
                            :placeholder="t('pages.notifications.webhookSecretPlaceholder')"
                        />
                    </label>
                </div>

                <div class="mt-6">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                        <h4 class="font-medium">{{ t("pages.notifications.filters") }}</h4>
                        <div class="flex gap-2">
                            <button type="button" class="btn btn-ghost btn-xs" @click="selectAllEventKinds">
                                {{ t("pages.notifications.selectAllEvents") }}
                            </button>
                            <button type="button" class="btn btn-ghost btn-xs" @click="clearEventKinds">
                                {{ t("pages.notifications.clearEvents") }}
                            </button>
                        </div>
                    </div>
                    <p class="mt-1 text-sm text-base-content/60">{{ t("pages.notifications.filtersHint") }}</p>
                    <div class="filter-grid mt-3">
                        <label
                            v-for="kind in eventKindOptions"
                            :key="kind"
                            class="filter-option"
                        >
                            <input
                                type="checkbox"
                                class="checkbox checkbox-sm"
                                :checked="formAllowedKinds.includes(kind)"
                                @change="toggleEventKind(kind)"
                            />
                            <span>{{ kind }}</span>
                        </label>
                    </div>
                </div>

                <div class="modal-action">
                    <button type="button" class="btn" @click="closeFormModal">
                        {{ t("common.cancel") }}
                    </button>
                    <button type="button" class="btn btn-primary" :disabled="saving" @click="saveDestination">
                        {{ t("common.save") }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit">{{ t("common.dismiss") }}</button>
            </form>
        </dialog>

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

<style scoped>
.destination-grid {
    display: grid;
    gap: 1rem;
}

.filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.25rem 0.75rem;
    max-height: 16rem;
    overflow-y: auto;
}

.filter-option {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.85rem;
}
</style>
