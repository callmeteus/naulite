<script setup lang="ts">
import { useI18n } from "vue-i18n";

import AppShell from "./components/layout/AppShell.vue";
import ToastHost from "./components/ui/ToastHost.vue";
import { useLocale } from "./composables/useLocale";
import { useAuthStore } from "./stores/Auth";

const auth = useAuthStore();
const { t } = useI18n();
const { restoreLocale } = useLocale();

restoreLocale();
</script>

<template>
    <ToastHost />
    <div v-if="auth.loading && !auth.checked" class="flex min-h-screen items-center justify-center">
        <span class="loading loading-spinner loading-lg text-primary" />
        <span class="sr-only">{{ t("common.loading") }}</span>
    </div>
    <div v-else-if="$route.meta.public" class="min-h-screen bg-base-200">
        <router-view />
    </div>
    <AppShell v-else>
        <router-view />
    </AppShell>
</template>
