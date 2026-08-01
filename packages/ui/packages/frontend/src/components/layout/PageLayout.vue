<script setup lang="ts">
defineProps<{
    /**
     * i18n key for the page title.
     */
    titleKey: string;

    /**
     * Optional literal title override when the heading is dynamic.
     */
    title?: string;

    /**
     * Optional i18n key for the page hint text.
     */
    hintKey?: string;
}>();
</script>

<template>
    <section class="flex flex-col gap-6">
        <header class="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 class="text-2xl font-bold">
                    {{ title ?? $t(titleKey) }}
                </h1>
                <p v-if="hintKey" class="mt-1 text-sm text-base-content/70">
                    {{ $t(hintKey) }}
                </p>
            </div>
            <div v-if="$slots.actions" class="flex flex-wrap items-center gap-2">
                <slot name="actions" />
            </div>
        </header>
        <div v-if="$slots.filters" class="flex flex-wrap items-end gap-3">
            <slot name="filters" />
        </div>
        <slot />
    </section>
</template>
