<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { Eye, EyeOff } from "@lucide/vue";

import type { ResolvedSecret } from "@naulite/sdk";
import { nauliteClient } from "../../api/Client";
import ErrorAlert from "../ui/ErrorAlert.vue";
import LoadingSpinner from "../ui/LoadingSpinner.vue";

const { t } = useI18n();

const dialogRef = ref<HTMLDialogElement | null>(null);
const secretName = ref("");
const revealed = ref<ResolvedSecret | null>(null);
const loading = ref(false);
const error = ref("");
const visibleKeys = ref<Record<string, boolean>>({});

/**
 * Clears reveal modal state.
 *
 * @returns Nothing.
 */
function resetState(): void {
    secretName.value = "";
    revealed.value = null;
    loading.value = false;
    error.value = "";
    visibleKeys.value = {};
}

/**
 * Opens the reveal modal and loads secret values.
 *
 * @param name Secret name
 * @returns Nothing.
 */
async function open(name: string): Promise<void> {
    resetState();
    secretName.value = name;
    dialogRef.value?.showModal();
    loading.value = true;

    try {
        revealed.value = await nauliteClient.revealSecret(name);
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Closes the reveal modal.
 *
 * @returns Nothing.
 */
function close(): void {
    dialogRef.value?.close();
    resetState();
}

/**
 * Toggles visibility for a secret key value.
 *
 * @param key Secret key
 * @returns Nothing.
 */
function toggleKeyVisibility(key: string): void {
    visibleKeys.value[key] = !visibleKeys.value[key];
}

/**
 * Returns whether a secret key value is visible.
 *
 * @param key Secret key
 * @returns Whether the value is shown in plain text
 */
function isKeyVisible(key: string): boolean {
    return visibleKeys.value[key] === true;
}

defineExpose({ open, close });
</script>

<template>
    <dialog ref="dialogRef" class="modal">
        <div class="modal-box max-w-2xl">
            <h3 class="text-lg font-bold">{{ t("pages.secrets.revealTitle") }}</h3>
            <p v-if="secretName" class="mt-1 font-mono text-sm text-base-content/70">{{ secretName }}</p>

            <div v-if="loading" class="flex items-center gap-2 py-8">
                <LoadingSpinner />
                <span>{{ t("common.loading") }}</span>
            </div>

            <ErrorAlert v-else-if="error" :error="error" />

            <div v-else-if="revealed" class="mt-4 overflow-x-auto">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("pages.secrets.key") }}</th>
                            <th>{{ t("pages.secrets.value") }}</th>
                            <th class="w-16">{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(value, key) in revealed.data" :key="key">
                            <td class="font-mono text-sm">{{ key }}</td>
                            <td class="font-mono text-sm">
                                <span v-if="isKeyVisible(key)">{{ value }}</span>
                                <span v-else>{{ "•".repeat(Math.min(value.length, 24) || 8) }}</span>
                            </td>
                            <td>
                                <button
                                    type="button"
                                    class="btn btn-ghost btn-square btn-sm"
                                    :aria-label="isKeyVisible(key) ? t('pages.secrets.hide') : t('pages.secrets.reveal')"
                                    @click="toggleKeyVisibility(key)"
                                >
                                    <EyeOff v-if="isKeyVisible(key)" class="size-4" />
                                    <Eye v-else class="size-4" />
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="modal-action">
                <button type="button" class="btn" @click="close">{{ t("common.dismiss") }}</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="button" @click="close">close</button>
        </form>
    </dialog>
</template>
