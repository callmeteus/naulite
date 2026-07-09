<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import { resolveStatusTone, statusBadgeClass } from "../../utils/StatusPill";

const props = withDefaults(
    defineProps<{
        /**
         * Raw platform status value to display.
         */
        status: string;

        /**
         * Badge size preset.
         */
        size?: "sm" | "md";
    }>(),
    {
        size: "sm"
    }
);

const { t, te } = useI18n();

const normalizedStatus = computed(() => props.status.trim().toLowerCase());

const label = computed(() => {
    const key = `status.values.${normalizedStatus.value}`;
    return te(key) ? t(key) : props.status;
});

const badgeClass = computed(() => statusBadgeClass(resolveStatusTone(normalizedStatus.value)));
</script>

<template>
    <span
        class="badge font-medium"
        :class="[badgeClass, size === 'sm' ? 'badge-sm' : '']"
    >
        {{ label }}
    </span>
</template>
