<script setup lang="ts">
import { computed, provide } from "vue";

enum MetadataGridColumns {
    TWO = 2,
    THREE = 3,
    FOUR = 4
}

enum MetadataGridDensity {
    DEFAULT = "default",
    COMPACT = "compact"
}

const props = withDefaults(defineProps<{
    /**
     * Number of columns on large screens.
     */
    columns?: MetadataGridColumns;

    /**
     * Visual density for labels and values.
     */
    density?: MetadataGridDensity;
}>(), {
    columns: MetadataGridColumns.THREE,
    density: MetadataGridDensity.DEFAULT
});

provide("metadataGridColumns", computed(() => props.columns));
provide("metadataGridDensity", computed(() => props.density));

const gridClass = computed(() => {
    const gap = props.density === MetadataGridDensity.COMPACT ? "gap-3" : "gap-4";
    const base = `grid ${gap}`;

    if (props.columns === MetadataGridColumns.TWO) {
        return `${base} sm:grid-cols-2`;
    }

    if (props.columns === MetadataGridColumns.FOUR) {
        return `${base} md:grid-cols-2 xl:grid-cols-4`;
    }

    return `${base} md:grid-cols-2 xl:grid-cols-3`;
});
</script>

<template>
    <dl :class="gridClass">
        <slot />
    </dl>
</template>
