<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import type {
    CreateNotificationDestinationInput,
    PipelineEventKind,
    UpdateNotificationDestinationInput
} from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import NotificationDestinationFormFields from "../components/notifications/NotificationDestinationFormFields.vue";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";

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

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const loading = ref(false);
const saving = ref(false);
const error = ref("");
const formName = ref("");
const formType = ref<"SLACK" | "WEBHOOK">("SLACK");
const formUrl = ref("");
const formSecret = ref("");
const formEnabled = ref(true);
const formAllowedKinds = ref<PipelineEventKind[]>([]);

const destinationId = computed(() => {
    const id = route.params.id;
    return typeof id === "string" ? id : "";
});

const isEditMode = computed(() => destinationId.value.length > 0);

const pageTitleKey = computed(() => (
    isEditMode.value
        ? "pages.notifications.editDestination"
        : "pages.notifications.addDestination"
));

/**
 * Loads destination data when editing.
 *
 * @returns Nothing.
 */
async function loadDestination(): Promise<void> {
    if (!isEditMode.value) {
        return;
    }

    loading.value = true;
    error.value = "";

    try {
        const destination = await nauliteClient.getNotificationDestination(destinationId.value);
        formName.value = destination.name;
        formType.value = destination.type;
        formUrl.value = destination.url;
        formSecret.value = "";
        formEnabled.value = destination.enabled;
        formAllowedKinds.value = [...destination.allowedKinds];
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
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

    try {
        if (isEditMode.value) {
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

            await nauliteClient.updateNotificationDestination(destinationId.value, payload);
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
        }

        await router.push({
            path: "/notifications",
            query: { saved: "1" }
        });
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

onMounted(() => {
    if (isEditMode.value) {
        void loadDestination();
    }
});
</script>

<template>
    <PageLayout :title-key="pageTitleKey" hint-key="pages.notifications.formHint">
        <template #actions>
            <RouterLink to="/notifications" class="btn btn-ghost btn-sm">
                {{ t("pages.notifications.backToList") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <form
            v-else
            class="mx-auto flex w-full max-w-3xl flex-col gap-6"
            @submit.prevent="saveDestination"
        >
            <div class="card bg-base-100 shadow">
                <div class="card-body">
                    <NotificationDestinationFormFields
                        v-model:name="formName"
                        v-model:type="formType"
                        v-model:url="formUrl"
                        v-model:secret="formSecret"
                        v-model:enabled="formEnabled"
                        v-model:allowed-kinds="formAllowedKinds"
                        :event-kind-options="eventKindOptions"
                    />
                </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
                <RouterLink to="/notifications" class="btn">
                    {{ t("common.cancel") }}
                </RouterLink>
                <button
                    type="submit"
                    class="btn btn-primary"
                    :disabled="saving || !formName.trim() || !formUrl.trim()"
                >
                    {{ t("common.save") }}
                </button>
            </div>
        </form>
    </PageLayout>
</template>
