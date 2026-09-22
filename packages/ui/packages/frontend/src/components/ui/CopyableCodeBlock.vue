<script setup lang="ts">
import { Check, Copy } from "@lucide/vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
    code: string;
    labelKey?: string;
    emptyKey?: string;
}>();

const { t } = useI18n();

const copied = ref(false);

/**
 * Copies the code block to the clipboard.
 *
 * @returns Nothing.
 */
async function copyCode(): Promise<void> {
    if (!props.code) {
        return;
    }

    await navigator.clipboard.writeText(props.code);
    copied.value = true;

    window.setTimeout(() => {
        copied.value = false;
    }, 2000);
}
</script>

<template>
    <div class="space-y-2">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <p v-if="labelKey" class="text-sm font-medium">
                {{ t(labelKey) }}
            </p>
            <button
                type="button"
                class="btn btn-outline btn-xs gap-1"
                :disabled="!code"
                @click="copyCode"
            >
                <Check v-if="copied" class="size-3.5" />
                <Copy v-else class="size-3.5" />
                {{ copied ? t("common.copied") : t("common.copy") }}
            </button>
        </div>
        <pre class="overflow-x-auto rounded-lg bg-base-300 p-3 text-xs"><code>{{
            code || (emptyKey ? t(emptyKey) : "")
        }}</code></pre>
    </div>
</template>
