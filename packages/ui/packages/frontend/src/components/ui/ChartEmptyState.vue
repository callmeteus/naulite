<script setup lang="ts">
import type { Component } from "vue";
import { ChartLine } from "@lucide/vue";

withDefaults(
    defineProps<{
        /**
         * i18n key for the empty chart title.
         */
        titleKey: string;

        /**
         * Optional i18n key for supporting copy.
         */
        descriptionKey?: string;

        /**
         * Uses a shorter layout for nested chart panels.
         */
        compact?: boolean;

        /**
         * Optional icon override.
         */
        icon?: Component;
    }>(),
    {
        compact: false
    }
);
</script>

<template>
    <div
        class="relative overflow-hidden rounded-lg bg-base-200/20"
        :class="compact ? 'min-h-[180px]' : 'min-h-[220px]'"
    >
        <div
            class="pointer-events-none absolute inset-0 opacity-30"
            style="background-image: linear-gradient(to right, color-mix(in oklab, currentColor 8%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, currentColor 8%, transparent) 1px, transparent 1px); background-size: 28px 28px;"
        />

        <div
            class="relative flex h-full flex-col items-center justify-center gap-2 px-4 text-center"
            :class="compact ? 'py-8' : 'py-10'"
        >
            <component
                :is="icon ?? ChartLine"
                class="text-base-content/25"
                :class="compact ? 'size-8' : 'size-10'"
            />
            <div class="max-w-xs space-y-1">
                <p class="text-sm text-base-content/70">
                    {{ $t(titleKey) }}
                </p>
                <p
                    v-if="descriptionKey && !compact"
                    class="text-xs text-base-content/50"
                >
                    {{ $t(descriptionKey) }}
                </p>
            </div>
        </div>
    </div>
</template>
