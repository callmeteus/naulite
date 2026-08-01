<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { ApiKey } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const auth = useAuthStore();
const keys = ref<ApiKey[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const name = ref("");
const createdSecret = ref<string | null>(null);
const creating = ref(false);
const createModalRef = ref<HTMLDialogElement | null>(null);

const canWrite = computed(() => auth.hasPermission("admin:api-keys:write"));

/**
 * Loads API keys from the control plane.
 *
 * @returns Nothing.
 */
async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
        keys.value = await nauliteClient.listApiKeys();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Opens the create API key modal.
 *
 * @returns Nothing.
 */
function openCreateModal(): void {
    name.value = "";
    createModalRef.value?.showModal();
}

/**
 * Closes the create API key modal.
 *
 * @returns Nothing.
 */
function closeCreateModal(): void {
    createModalRef.value?.close();
}

/**
 * Creates a new API key for remote CLI access.
 *
 * @returns Nothing.
 */
async function createKey(): Promise<void> {
    const trimmedName = name.value.trim();
    if (!trimmedName) {
        return;
    }

    creating.value = true;
    error.value = null;

    try {
        const created = await nauliteClient.createApiKey(trimmedName);
        createdSecret.value = created.secret;
        closeCreateModal();
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        creating.value = false;
    }
}

/**
 * Revokes an API key by identifier.
 *
 * @param apiKeyId API key identifier
 * @returns Nothing.
 */
async function revokeKey(apiKeyId: string): Promise<void> {
    error.value = null;

    try {
        await nauliteClient.revokeApiKey(apiKeyId);
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    }
}

/**
 * Clears the one-time secret banner after the operator copies it.
 *
 * @returns Nothing.
 */
function dismissSecret(): void {
    createdSecret.value = null;
}

onMounted(() => {
    void refresh();
});
</script>

<template>
    <PageLayout title-key="pages.apiKeys.title" hint-key="pages.apiKeys.hint">
        <template #actions>
            <button
                v-if="canWrite"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openCreateModal"
            >
                {{ t("pages.apiKeys.create") }}
            </button>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="createdSecret" class="alert alert-warning">
            <div class="flex w-full flex-col gap-2">
                <p><strong>{{ t("pages.apiKeys.created") }}</strong></p>
                <code class="break-all rounded bg-base-300 p-2 text-sm">{{ createdSecret }}</code>
                <p class="text-sm">
                    {{ t("pages.apiKeys.copyOnce") }}
                </p>
                <button type="button" class="btn btn-sm w-fit" @click="dismissSecret">
                    {{ t("common.dismiss") }}
                </button>
            </div>
        </div>

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && keys.length === 0"
            title-key="pages.apiKeys.emptyTitle"
            description-key="pages.apiKeys.emptyDescription"
            :action-label-key="canWrite ? 'pages.apiKeys.emptyAction' : undefined"
            @action="openCreateModal"
        />

        <div v-else-if="!error" class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("pages.apiKeys.name") }}</th>
                            <th>{{ t("pages.apiKeys.prefix") }}</th>
                            <th>{{ t("pages.apiKeys.createdAt") }}</th>
                            <th>{{ t("pages.apiKeys.lastUsed") }}</th>
                            <th v-if="canWrite">
                                {{ t("common.actions") }}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="apiKey in keys" :key="apiKey.id">
                            <td>{{ apiKey.name }}</td>
                            <td><code>{{ apiKey.prefix }}...</code></td>
                            <td>{{ apiKey.createdAt }}</td>
                            <td>{{ apiKey.lastUsedAt ?? "-" }}</td>
                            <td v-if="canWrite">
                                <button type="button" class="btn btn-error btn-outline btn-sm" @click="revokeKey(apiKey.id)">
                                    {{ t("pages.apiKeys.revoke") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <dialog ref="createModalRef" class="modal">
            <div class="modal-box">
                <h3 class="text-lg font-bold">
                    {{ t("pages.apiKeys.addTitle") }}
                </h3>

                <form class="mt-4 grid gap-4" @submit.prevent="createKey">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.apiKeys.name") }}</span>
                        <input
                            id="api-key-name"
                            v-model="name"
                            type="text"
                            maxlength="120"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.apiKeys.namePlaceholder')"
                            autocomplete="off"
                        />
                    </label>

                    <div class="modal-action mt-2 px-0">
                        <button type="button" class="btn" @click="closeCreateModal">
                            {{ t("common.cancel") }}
                        </button>
                        <button type="submit" class="btn btn-primary" :disabled="creating || !name.trim()">
                            {{ t("pages.apiKeys.create") }}
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="button" @click="closeCreateModal">
                    close
                </button>
            </form>
        </dialog>
    </PageLayout>
</template>
