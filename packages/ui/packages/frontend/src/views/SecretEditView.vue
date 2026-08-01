<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import { nauliteClient } from "../api/Client";
import SecretFormFields from "../components/secrets/SecretFormFields.vue";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useClusterStore();

const secretName = ref("");
const secretDescription = ref("");
const entries = ref([{ key: "", value: "" }]);
const formError = ref("");
const loading = ref(false);
const saving = ref(false);

const targetSecretName = computed(() => {
    const name = route.query.name;
    return typeof name === "string" ? name.trim() : "";
});

/**
 * Builds the secret data map from form rows.
 *
 * @returns Parsed secret data
 * @throws {Error} {@link Error}
 */
function buildSecretData(): Record<string, string> {
    const data: Record<string, string> = {};
    const seenKeys = new Set<string>();

    for (const entry of entries.value) {
        const trimmedKey = entry.key.trim();

        if (!trimmedKey) {
            continue;
        }

        if (seenKeys.has(trimmedKey)) {
            throw new Error(t("pages.secrets.duplicateKey", { key: trimmedKey }));
        }

        seenKeys.add(trimmedKey);
        data[trimmedKey] = entry.value;
    }

    if (Object.keys(data).length === 0) {
        throw new Error(t("pages.secrets.atLeastOneKey"));
    }

    return data;
}

/**
 * Loads secret metadata and decrypted values for editing.
 *
 * @returns Nothing.
 */
async function loadSecret(): Promise<void> {
    if (!targetSecretName.value) {
        await router.replace("/secrets");
        return;
    }

    loading.value = true;
    formError.value = "";
    store.error = null;

    try {
        const revealed = await nauliteClient.revealSecret(targetSecretName.value);
        secretName.value = revealed.name;
        secretDescription.value = "";

        const rows = Object.entries(revealed.data).map(([key, value]) => ({ key, value }));
        entries.value = rows.length > 0 ? rows : [{ key: "", value: "" }];

        await store.refreshSecrets();
        const metadata = store.secrets.find((secret) => secret.name === revealed.name);
        secretDescription.value = metadata?.description ?? "";
    } catch (err) {
        formError.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Saves secret edits and returns to the list.
 *
 * @returns Nothing.
 */
async function saveSecret(): Promise<void> {
    formError.value = "";

    if (!secretName.value.trim()) {
        formError.value = t("pages.secrets.nameRequired");
        return;
    }

    saving.value = true;
    store.error = null;

    try {
        const data = buildSecretData();
        await store.upsertSecret(secretName.value.trim(), data, secretDescription.value.trim() || undefined);
        await router.push("/secrets");
    } catch (err) {
        formError.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

onMounted(() => {
    void loadSecret();
});
</script>

<template>
    <PageLayout title-key="pages.secrets.editTitle" hint-key="pages.secrets.editHint">
        <template #actions>
            <RouterLink to="/secrets" class="btn btn-ghost btn-sm">
                {{ t("pages.secrets.backToList") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="store.error" />

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <p v-else-if="formError && !secretName.trim()" class="text-sm text-error">
            {{ formError }}
        </p>

        <form
            v-else-if="secretName.trim()"
            class="mx-auto flex w-full max-w-3xl flex-col gap-6"
            @submit.prevent="saveSecret"
        >
            <div class="card bg-base-100 shadow">
                <div class="card-body">
                    <SecretFormFields
                        v-model:name="secretName"
                        v-model:description="secretDescription"
                        v-model:entries="entries"
                        v-model:form-error="formError"
                        name-readonly
                    />
                </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
                <RouterLink to="/secrets" class="btn">
                    {{ t("common.cancel") }}
                </RouterLink>
                <button type="submit" class="btn btn-primary" :disabled="saving || !targetSecretName">
                    {{ t("common.save") }}
                </button>
            </div>
        </form>
    </PageLayout>
</template>
