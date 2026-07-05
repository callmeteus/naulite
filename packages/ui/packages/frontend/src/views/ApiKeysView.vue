<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { ApiKey } from "@naulite/sdk";

import { nauliteClient } from "../api/Client";
import { t } from "../ui/Translate";

const keys = ref<ApiKey[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const name = ref("");
const createdSecret = ref<string | null>(null);
const creating = ref(false);

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
        name.value = "";
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
    <section>
        <h2>{{ t("apiKeys") }}</h2>
        <p class="hint">{{ t("apiKeysHint") }}</p>

        <div v-if="createdSecret" class="panel secret-panel">
            <p><strong>{{ t("apiKeyCreated") }}</strong></p>
            <code>{{ createdSecret }}</code>
            <p class="hint">{{ t("apiKeyCopyOnce") }}</p>
            <button type="button" @click="dismissSecret">{{ t("dismiss") }}</button>
        </div>

        <form class="panel create-form" @submit.prevent="createKey">
            <label for="api-key-name">{{ t("apiKeyName") }}</label>
            <input
                id="api-key-name"
                v-model="name"
                type="text"
                maxlength="120"
                :placeholder="t('apiKeyNamePlaceholder')"
            />
            <button type="submit" :disabled="creating || !name.trim()">
                {{ t("createApiKey") }}
            </button>
        </form>

        <p v-if="loading">Loading...</p>
        <p v-else-if="error" class="error">{{ error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>{{ t("apiKeyName") }}</th>
                        <th>{{ t("apiKeyPrefix") }}</th>
                        <th>{{ t("apiKeyCreatedAt") }}</th>
                        <th>{{ t("apiKeyLastUsed") }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="apiKey in keys" :key="apiKey.id">
                        <td>{{ apiKey.name }}</td>
                        <td><code>{{ apiKey.prefix }}...</code></td>
                        <td>{{ apiKey.createdAt }}</td>
                        <td>{{ apiKey.lastUsedAt ?? "-" }}</td>
                        <td>
                            <button type="button" class="danger" @click="revokeKey(apiKey.id)">
                                {{ t("revokeApiKey") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
