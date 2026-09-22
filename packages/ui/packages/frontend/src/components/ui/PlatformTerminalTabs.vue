<script setup lang="ts">
import { useI18n } from "vue-i18n";

import type { TerminalPlatform } from "./TerminalPlatform";

const platform = defineModel<TerminalPlatform>({ default: "windows" });

const { t } = useI18n();
</script>

<template>
    <div class="tabs tabs-boxed w-fit tabs-sm">
        <button
            type="button"
            class="tab"
            :class="{ 'tab-active': platform === 'windows' }"
            @click="platform = 'windows'"
        >
            {{ t("pages.provision.manualPlatformWindows") }}
        </button>
        <button
            type="button"
            class="tab"
            :class="{ 'tab-active': platform === 'unix' }"
            @click="platform = 'unix'"
        >
            {{ t("pages.provision.manualPlatformLinux") }}
        </button>
    </div>
</template>
