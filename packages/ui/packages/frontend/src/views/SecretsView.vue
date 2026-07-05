<script setup lang="ts">
import { onMounted, ref } from "vue";

import { t } from "../ui/Translate";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const auth = useAuthStore();
const secretName = ref("");
const secretDataJson = ref("{\n  \"password\": \"change-me\"\n}");
const secretDescription = ref("");

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
 * Deletes a cluster secret by name.
 *
 * @param name Secret name
 * @returns Nothing.
 */
async function deleteSecret(name: string): Promise<void> {
    await store.deleteSecret(name);
}
</script>

<template>
    <section>
        <h2>{{ t("secrets") }}</h2>
        <p class="hint">{{ t("secretsHint") }}</p>

        <form v-if="auth.hasPermission('secrets:write')" class="panel create-form" @submit.prevent="saveSecret">
            <label for="secret-name">{{ t("secretName") }}</label>
            <input
                id="secret-name"
                v-model="secretName"
                type="text"
                :placeholder="t('secretNamePlaceholder')"
            />
            <label for="secret-data">{{ t("secretData") }}</label>
            <textarea id="secret-data" v-model="secretDataJson" />
            <label for="secret-description">{{ t("secretDescription") }}</label>
            <input
                id="secret-description"
                v-model="secretDescription"
                type="text"
                :placeholder="t('secretDescriptionPlaceholder')"
            />
            <button type="submit" :disabled="store.loading || !secretName.trim()">
                {{ t("saveSecret") }}
            </button>
        </form>

        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Scope</th>
                        <th>Keys</th>
                        <th></th>
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
                                class="danger"
                                @click="deleteSecret(secret.name)"
                            >
                                {{ t("deleteSecret") }}
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
