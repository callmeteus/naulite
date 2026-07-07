<script setup lang="ts">
import { useToast } from "../../stores/Toast";

const { toasts, dismiss } = useToast();
</script>

<template>
    <div class="toast toast-end toast-top z-50">
        <div
            v-for="toast in toasts"
            :key="toast.id"
            class="alert shadow-lg"
            :class="{
                'alert-success': toast.type === 'success',
                'alert-error': toast.type === 'error',
                'alert-info': toast.type === 'info'
            }"
        >
            <span>{{ toast.message }}</span>
            <button type="button" class="btn btn-ghost btn-xs" @click="dismiss(toast.id)">×</button>
        </div>
    </div>
</template>
