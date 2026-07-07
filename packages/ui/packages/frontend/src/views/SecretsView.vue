<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();
const secretName = ref("");
const secretDataJson = ref("{\n  \"password\": \"change-me\"\n}");
const secretDescription = ref("");
const deleteTarget = ref("");
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

onMounted(() => {
    void store.refreshSecrets();
});

/**
 * Parses the JSON editor contents into secret key-value pairs.
 *
 * @returns Parsed secret data map
 */
function parseSecretData(): Record<string, string> {
    const parsed = JSON.parse(secretDataJson.value) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Secret data must be a JSON object.");
    }

    const data: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
        if (typeof value !== "string") {
            throw new Error(`Secret value for "${key}" must be a string.`);
        }

        data[key] = value;
    }

    if (Object.keys(data).length === 0) {
        throw new Error("At least one secret key is required.");
    }

    return data;
}

/**
 * Creates or updates a cluster secret from the form fields.
 *
 * @returns Nothing.
 */
async function saveSecret(): Promise<void> {
    const trimmedName = secretName.value.trim();
    if (!trimmedName) {
        return;
    }

    const data = parseSecretData();
    await store.upsertSecret(
        trimmedName,
        data,
        secretDescription.value.trim() || undefined
    );
    secretName.value = "";
    secretDescription.value = "";
}

/**
 * Opens the delete confirmation modal for a secret.
 *
 * @param name Secret name
 * @returns Nothing.
 */
function requestDeleteSecret(name: string): void {
    deleteTarget.value = name;
    deleteModalRef.value?.open();
}

/**
 * Deletes a cluster secret by name.
 *
 * @returns Nothing.
 */
async function confirmDeleteSecret(): Promise<void> {
    if (!deleteTarget.value) {
        return;
    }

    await store.deleteSecret(deleteTarget.value);
    deleteTarget.value = "";
}
</script>

<template>
    <PageLayout title-key="pages.secrets.title" hint-key="pages.secrets.hint">
        <ErrorAlert :error="store.error" />

        <div v-if="auth.hasPermission('secrets:write')" class="card bg-base-100 shadow">
            <div class="card-body gap-4">
                <form class="grid gap-4" @submit.prevent="saveSecret">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.secrets.name") }}</span>
                        <input
                            id="secret-name"
                            v-model="secretName"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.secrets.namePlaceholder')"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.secrets.data") }}</span>
                        <textarea
                            id="secret-data"
                            v-model="secretDataJson"
                            class="textarea textarea-bordered min-h-32 font-mono text-sm"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.secrets.description") }}</span>
                        <input
                            id="secret-description"
                            v-model="secretDescription"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.secrets.descriptionPlaceholder')"
                        />
                    </label>
                    <div>
                        <button type="submit" class="btn btn-primary" :disabled="store.loading || !secretName.trim()">
                            {{ t("pages.secrets.save") }}
                        </button>
                    </div>
                </form>
            </div>
        </div>

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.secrets.length === 0"
            title-key="pages.secrets.emptyTitle"
            description-key="pages.secrets.emptyDescription"
            action-label-key="pages.secrets.emptyAction"
        />

        <div v-else-if="!store.error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.tableColumns.name") }}</th>
                            <th>{{ t("common.tableColumns.scope") }}</th>
                            <th>{{ t("common.tableColumns.keys") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="secret in store.secrets" :key="secret.id">
                            <td>{{ secret.name }}</td>
                            <td>{{ secret.scope }}</td>
                            <td>{{ secret.keys.join(", ") }}</td>
                            <td>
                                <button
                                    v-if="auth.hasPermission('secrets:write')"
                                    type="button"
                                    class="btn btn-error btn-outline btn-sm"
                                    @click="requestDeleteSecret(secret.name)"
                                >
                                    {{ t("pages.secrets.delete") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <ConfirmModal
            ref="deleteModalRef"
            title-key="pages.secrets.delete"
            confirm-label-key="common.delete"
            danger
            @confirm="confirmDeleteSecret"
        >
            <p v-if="deleteTarget" class="py-4">{{ deleteTarget }}</p>
        </ConfirmModal>
    </PageLayout>
</template>
