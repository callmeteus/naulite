<script setup lang="ts">
import { computed, inject, type Ref } from "vue";

enum MetadataGridColumns {
    TWO = 2,
    THREE = 3,
    FOUR = 4
}

type MetadataGridDensity = "default" | "compact";

const props = withDefaults(defineProps<{
    /**
     * Field label shown above the value.
     */
    label: string;

    /**
     * Plain-text value when the default slot is empty.
     */
    value?: string | number | null;

    /**
     * Column span inside the parent grid.
     */
    span?: "full" | "two";

    /**
     * Hides the label visually while keeping it available to screen readers.
     */
    hideLabel?: boolean;
}>(), {
    span: undefined,
    hideLabel: false
});

const columns = inject<Ref<MetadataGridColumns>>(
    "metadataGridColumns",
    computed(() => MetadataGridColumns.THREE)
);

const density = inject<Ref<MetadataGridDensity>>(
    "metadataGridDensity",
    computed(() => "default" as MetadataGridDensity)
);

const labelClass = computed(() => {
    if (props.hideLabel) {
        return "sr-only";
    }

    if (density.value === "compact") {
        return "text-xs text-base-content/60";
    }

    return "text-sm font-medium text-base-content/70";
});

const valueClass = computed(() => {
    if (density.value === "compact") {
        return "font-medium";
    }

    return "";
});

const itemClass = computed(() => {
    const classes = ["space-y-1"];

    if (props.span === "two") {
        classes.push("md:col-span-2");
    }

    if (props.span === "full") {
        if (columns.value === MetadataGridColumns.FOUR) {
            classes.push("md:col-span-2", "xl:col-span-4");
        } else
        if (columns.value === MetadataGridColumns.TWO) {
            classes.push("sm:col-span-2");
        } else {
            classes.push("md:col-span-2", "xl:col-span-3");
        }
    }

    return classes;
});

const displayValue = computed(() => {
    if (props.value === undefined || props.value === null || props.value === "") {
        return "-";
    }

    return String(props.value);
});
</script>

<template>
    <div :class="itemClass">
        <dt :class="labelClass">
            {{ label }}
        </dt>
        <dd :class="valueClass">
            <slot>{{ displayValue }}</slot>
        </dd>
    </div>
</template>
