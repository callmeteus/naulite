<script setup lang="ts">
import nauliteMarkUrl from "~root/assets/naulite-mark.svg?url";

withDefaults(
    defineProps<{
        showWordmark?: boolean;
        showMark?: boolean;
        size?: "sm" | "md" | "lg";
    }>(),
    {
        showWordmark: true,
        showMark: true,
        size: "md"
    }
);

const markSizeClasses = {
    sm: "h-7 w-7",
    md: "h-9 w-9",
    lg: "h-12 w-12"
} as const;

const wordmarkSizeClasses = {
    sm: "text-base",
    md: "text-xl",
    lg: "text-3xl"
} as const;
</script>

<template>
    <div class="flex items-center gap-2">
        <img
            v-if="showMark"
            :src="nauliteMarkUrl"
            alt=""
            :class="markSizeClasses[size]"
            class="shrink-0"
        />
        <span
            v-if="showWordmark"
            :class="wordmarkSizeClasses[size]"
            class="font-bold lowercase tracking-tight text-base-content"
        >naulite</span>
    </div>
</template>
