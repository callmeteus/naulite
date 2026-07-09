<script setup lang="ts" generic="T extends string">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { RelationEntry } from "../../utils/Relation";

const props = withDefaults(
    defineProps<{
        /**
         * Selectable relation entries.
         */
        relation: RelationEntry<T>[];

        /**
         * Currently selected relation value.
         */
        modelValue: T;

        /**
         * Whether the select input is disabled.
         */
        disabled?: boolean;
    }>(),
    {
        disabled: false
    }
);

const emit = defineEmits<{
    "update:modelValue": [value: T];
}>();

const { t } = useI18n();

const selectedHelperText = computed(() => {
    const entry = props.relation.find((item) => item.key === props.modelValue);

    if (!entry?.helperTextKey) {
        return "";
    }

    return t(entry.helperTextKey);
});

/**
 * Updates the selected relation key.
 *
 * @param event Select change event
 * @returns Nothing.
 */
function onChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as T;
    emit("update:modelValue", value);
}
</script>

<template>
    <label class="form-control w-full">
        <span v-if="$slots.label" class="label-text">
            <slot name="label" />
        </span>
        <select
            class="select select-bordered w-full"
            :value="modelValue"
            :disabled="disabled"
            @change="onChange"
        >
            <option v-for="entry in relation" :key="entry.key" :value="entry.key">
                {{ t(entry.labelKey) }}
            </option>
        </select>
        <span v-if="selectedHelperText" class="label-text-alt mt-1 text-base-content/70">
            {{ selectedHelperText }}
        </span>
    </label>
</template>
