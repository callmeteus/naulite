<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Plus, Trash2 } from "@lucide/vue";

const { t } = useI18n();

const emit = defineEmits<{
    save: [payload: { name: string; data: Record<string, string>; description?: string }];
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const secretName = ref("");
const secretDescription = ref("");
const namePrefix = ref("");
const entries = ref([{ key: "", value: "" }]);
const formError = ref("");

/**
 * Resets the form fields to their initial state.
 *
 * @returns Nothing.
 */
function resetForm(): void {
    secretName.value = "";
    secretDescription.value = "";
    namePrefix.value = "";
    entries.value = [{ key: "", value: "" }];
    formError.value = "";
}

/**
 * Opens the secret form modal.
 *
 * @param prefix Optional folder prefix for the secret name
 * @returns Nothing.
 */
function open(prefix = ""): void {
    resetForm();
    namePrefix.value = prefix;
    if (prefix) {
        secretName.value = prefix;
    }
    dialogRef.value?.showModal();
}

/**
 * Closes the secret form modal.
 *
 * @returns Nothing.
 */
function close(): void {
    dialogRef.value?.close();
}

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

/**
 * Builds the secret data map from form rows.
 *
 * @returns Parsed secret data
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
 * Validates the form and emits the save payload.
 *
 * @returns Nothing.
 */
function submit(): void {
    formError.value = "";
    const trimmedName = secretName.value.trim();

    if (!trimmedName) {
        formError.value = t("pages.secrets.nameRequired");
        return;
    }

    try {
        const data = buildSecretData();
        emit("save", {
            name: trimmedName,
            data,
            description: secretDescription.value.trim() || undefined
        });
    } catch (err) {
        formError.value = err instanceof Error ? err.message : String(err);
    }
}

defineExpose({ open, close });
</script>

<template>
    <dialog ref="dialogRef" class="modal">
        <div class="modal-box max-w-2xl">
            <h3 class="text-lg font-bold">{{ t("pages.secrets.addTitle") }}</h3>
            <p class="mt-1 text-sm text-base-content/70">{{ t("pages.secrets.addHint") }}</p>

            <form class="mt-4 grid gap-4" @submit.prevent="submit">
                <label class="form-control w-full">
                    <span class="label-text">{{ t("pages.secrets.name") }}</span>
                    <input
                        v-model="secretName"
                        type="text"
                        class="input input-bordered w-full"
                        :placeholder="t('pages.secrets.namePlaceholder')"
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

                <p v-if="formError" class="text-sm text-error">{{ formError }}</p>

                <div class="modal-action mt-2">
                    <button type="button" class="btn" @click="close">{{ t("common.cancel") }}</button>
                    <button type="submit" class="btn btn-primary">{{ t("pages.secrets.save") }}</button>
                </div>
            </form>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="button" @click="close">close</button>
        </form>
    </dialog>
</template>
