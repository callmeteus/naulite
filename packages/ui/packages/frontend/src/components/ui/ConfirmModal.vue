<script setup lang="ts">
import { ref } from "vue";

defineProps<{
    titleKey: string;
    messageKey?: string;
    confirmLabelKey?: string;
    cancelLabelKey?: string;
    danger?: boolean;
}>();

const emit = defineEmits<{
    confirm: [];
    cancel: [];
}>();

const dialogRef = ref<HTMLDialogElement | null>(null);

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
 * Confirms the action and closes the dialog.
 *
 * @returns Nothing.
 */
function confirm(): void {
    emit("confirm");
    close();
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
            <h3 class="text-lg font-bold">{{ $t(titleKey) }}</h3>
            <p v-if="messageKey" class="py-4">{{ $t(messageKey) }}</p>
            <slot />
            <div class="modal-action">
                <button type="button" class="btn" @click="cancel">{{ $t(cancelLabelKey ?? "common.cancel") }}</button>
                <button
                    type="button"
                    class="btn"
                    :class="danger ? 'btn-error' : 'btn-primary'"
                    @click="confirm"
                >
                    {{ $t(confirmLabelKey ?? "common.confirm") }}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="button" @click="cancel">close</button>
        </form>
    </dialog>
</template>
