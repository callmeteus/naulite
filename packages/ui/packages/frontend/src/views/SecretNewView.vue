<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";

import SecretFormFields from "../components/secrets/SecretFormFields.vue";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const store = useClusterStore();

const secretName = ref("");
const secretDescription = ref("");
const entries = ref([{ key: "", value: "" }]);
const formError = ref("");
const saving = ref(false);

const namePrefix = computed(() => {
    const prefix = route.query.prefix;
    return typeof prefix === "string" ? prefix : "";
});

if (namePrefix.value) {
    secretName.value = namePrefix.value;
}

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
 * Saves the secret and returns to the list.
 *
 * @returns Nothing.
 */
async function saveSecret(): Promise<void> {
    formError.value = "";
    const trimmedName = secretName.value.trim();

    if (!trimmedName) {
        formError.value = t("pages.secrets.nameRequired");
        return;
    }

    saving.value = true;
    store.error = null;

    try {
        const data = buildSecretData();
        await store.upsertSecret(trimmedName, data, secretDescription.value.trim() || undefined);
        await router.push("/secrets");
    } catch (err) {
        formError.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.secrets.addTitle" hint-key="pages.secrets.addHint">
        <template #actions>
            <RouterLink to="/secrets" class="btn btn-ghost btn-sm">
                {{ t("pages.secrets.backToList") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="store.error" />

        <form
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
                    />
                </div>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
                <RouterLink to="/secrets" class="btn">
                    {{ t("common.cancel") }}
                </RouterLink>
                <button type="submit" class="btn btn-primary" :disabled="saving">
                    {{ t("pages.secrets.save") }}
                </button>
            </div>
        </form>
    </PageLayout>
</template>
