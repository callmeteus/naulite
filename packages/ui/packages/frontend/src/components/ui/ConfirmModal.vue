<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
    /**
     * i18n key for the modal title.
     */
    titleKey: string;

    /**
     * Optional i18n key for the modal message body.
     */
    messageKey?: string;

    /**
     * Optional i18n key for the confirm button label.
     */
    confirmLabelKey?: string;

    /**
     * Optional i18n key for the cancel button label.
     */
    cancelLabelKey?: string;

    /**
     * Whether the confirm action uses danger styling.
     */
    danger?: boolean;

    /**
     * Optional async handler invoked before the modal closes.
     */
    handler?: () => void | Promise<void>;
}>();

const emit = defineEmits<{
    confirm: [];
    cancel: [];
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);
const confirming = ref(false);

/**
 * Opens the confirmation dialog.
 *
 * @returns Nothing.
 */
function open(): void {
    dialogRef.value?.showModal();
}

/**
 * Closes the confirmation dialog.
 *
 * @returns Nothing.
 */
function close(): void {
    dialogRef.value?.close();
}

/**
 * Confirms the action and closes the dialog after async work completes.
 *
 * @returns Nothing.
 */
async function confirm(): Promise<void> {
    if (confirming.value) {
        return;
    }

    confirming.value = true;

    try {
        if (props.handler) {
            await props.handler();
        } else {
            emit("confirm");
        }

        close();
    } catch {
        close();
    } finally {
        confirming.value = false;
    }
}

/**
 * Cancels the action and closes the dialog.
 *
 * @returns Nothing.
 */
function cancel(): void {
    emit("cancel");
    close();
}

defineExpose({ open, close });
</script>

<template>
    <dialog ref="dialogRef" class="modal">
        <div class="modal-box">
            <h3 class="text-lg font-bold">
                {{ $t(titleKey) }}
            </h3>
            <p v-if="messageKey" class="py-4">
                {{ $t(messageKey) }}
            </p>
            <slot />
            <div class="modal-action">
                <button type="button" class="btn" :disabled="confirming" @click="cancel">
                    {{ $t(cancelLabelKey ?? "common.cancel") }}
                </button>
                <button
                    type="button"
                    class="btn"
                    :class="danger ? 'btn-error' : 'btn-primary'"
                    :disabled="confirming"
                    @click="confirm"
                >
                    <span v-if="confirming" class="loading loading-spinner loading-sm" />
                    {{
                        confirming
                            ? $t("common.working")
                            : $t(confirmLabelKey ?? "common.confirm")
                    }}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="button" @click="cancel">
                close
            </button>
        </form>
    </dialog>
</template>
