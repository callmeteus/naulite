<script setup lang="ts">
import { ref } from "vue";

import type { ParsedApiError } from "../../composables/useApiAction";

const props = defineProps<{
    /**
     * Parsed API error, plain message, or null when no error is shown.
     */
    error: ParsedApiError | string | null;
}>();

const showDetails = ref(false);

/**
 * Resolves the error message for display.
 *
 * @returns Error message string
 */
function message(): string {
    if (!props.error) {
        return "";
    }

    return typeof props.error === "string" ? props.error : props.error.message;
}

/**
 * Resolves optional validation details from a parsed error.
 *
 * @returns Details payload or undefined
 */
function details(): unknown {
    if (!props.error || typeof props.error === "string") {
        return undefined;
    }

    return props.error.details;
}
</script>

<template>
    <div v-if="error" role="alert" class="alert alert-error">
        <div class="flex w-full flex-col gap-2">
            <span>{{ message() }}</span>
            <button
                v-if="details()"
                type="button"
                class="btn btn-ghost btn-xs w-fit"
                @click="showDetails = !showDetails"
            >
                {{ $t("errors.detailsToggle") }}
            </button>
            <pre v-if="showDetails && details()" class="max-h-48 overflow-auto rounded bg-base-300 p-2 text-xs">{{ JSON.stringify(details(), null, 2) }}</pre>
        </div>
    </div>
</template>
