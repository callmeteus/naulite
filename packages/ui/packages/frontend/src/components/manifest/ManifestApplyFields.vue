<script setup lang="ts">
import { useI18n } from "vue-i18n";

import LoadingSpinner from "../ui/LoadingSpinner.vue";
import YamlEditor from "../ui/YamlEditor.vue";

const { t } = useI18n();

const manifestYaml = defineModel<string>({ required: true });

defineProps<{
    /**
     * Whether the YAML editor is disabled.
     */
    disabled?: boolean;

    /**
     * Whether manifest content is loading.
     */
    loading?: boolean;

    /**
     * Optional i18n key shown below the editor.
     */
    footerNoteKey?: string;
}>();
</script>

<template>
  <div class="flex flex-col gap-6">
    <slot name="intro" />

    <div
      v-if="loading"
      class="flex items-center gap-2 text-sm text-base-content/70"
      role="status"
    >
      <LoadingSpinner />
      <span>{{ t("common.loading") }}</span>
    </div>

    <div class="card bg-base-100 shadow">
      <div class="card-body gap-4">
        <YamlEditor
          v-model="manifestYaml"
          :disabled="disabled || loading"
          min-height="24rem"
        />

        <p v-if="footerNoteKey" class="text-xs text-base-content/60">
          {{ t(footerNoteKey) }}
        </p>
      </div>
    </div>

    <slot name="actions" />
  </div>
</template>
