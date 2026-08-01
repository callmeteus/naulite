<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Trash2 } from "@lucide/vue";

const { t } = useI18n();

const secretName = defineModel<string>("name", { required: true });
const secretDescription = defineModel<string>("description", { required: true });
const entries = defineModel<Array<{ key: string; value: string }>>("entries", { required: true });

const formError = defineModel<string>("formError", { default: "" });

defineProps<{
    /**
     * When true, the secret name cannot be changed.
     */
    nameReadonly?: boolean;
}>();

/**
 * Adds a new key-value row to the form.
 *
 * @returns Nothing.
 */
function addEntry(): void {
    entries.value.push({ key: "", value: "" });
}

/**
 * Removes a key-value row from the form.
 *
 * @param index Row index
 * @returns Nothing.
 */
function removeEntry(index: number): void {
    if (entries.value.length <= 1) {
        return;
    }

    entries.value.splice(index, 1);
}
</script>

<template>
    <div class="grid gap-4">
        <label class="form-control w-full">
            <span class="label-text">{{ t("pages.secrets.name") }}</span>
            <input
                v-model="secretName"
                type="text"
                class="input input-bordered w-full"
                :placeholder="t('pages.secrets.namePlaceholder')"
                :readonly="nameReadonly"
                :disabled="nameReadonly"
                autocomplete="off"
            />
        </label>

        <div class="grid gap-3">
            <div class="flex items-center justify-between gap-2">
                <span class="label-text font-medium">{{ t("pages.secrets.entries") }}</span>
                <button type="button" class="btn btn-ghost btn-sm" @click="addEntry">
                    <Plus class="size-4" />
                    {{ t("pages.secrets.addEntry") }}
                </button>
            </div>

            <div
                v-for="(entry, index) in entries"
                :key="index"
                class="grid gap-2 rounded-box border border-base-300 p-3 sm:grid-cols-[1fr_1fr_auto]"
            >
                <label class="form-control w-full">
                    <span class="label-text">{{ t("pages.secrets.key") }}</span>
                    <input
                        v-model="entry.key"
                        type="text"
                        class="input input-bordered w-full font-mono text-sm"
                        :placeholder="t('pages.secrets.keyPlaceholder')"
                        autocomplete="off"
                    />
                </label>
                <label class="form-control w-full">
                    <span class="label-text">{{ t("pages.secrets.value") }}</span>
                    <input
                        v-model="entry.value"
                        type="text"
                        class="input input-bordered w-full font-mono text-sm"
                        :placeholder="t('pages.secrets.valuePlaceholder')"
                        autocomplete="off"
                    />
                </label>
                <div class="flex items-end">
                    <button
                        type="button"
                        class="btn btn-ghost btn-square"
                        :disabled="entries.length <= 1"
                        :aria-label="t('pages.secrets.removeEntry')"
                        @click="removeEntry(index)"
                    >
                        <Trash2 class="size-4" />
                    </button>
                </div>
            </div>
        </div>

        <label class="form-control w-full">
            <span class="label-text">{{ t("pages.secrets.description") }}</span>
            <input
                v-model="secretDescription"
                type="text"
                class="input input-bordered w-full"
                :placeholder="t('pages.secrets.descriptionPlaceholder')"
                autocomplete="off"
            />
        </label>

        <p v-if="formError" class="text-sm text-error">
            {{ formError }}
        </p>
    </div>
</template>
