<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";

import { resolveDeliveryTab } from "../utils/DeliveryTabs";

const { t } = useI18n();
const route = useRoute();

const activeTab = computed(() => resolveDeliveryTab(route.path));
</script>

<template>
    <section class="flex flex-col gap-6">
        <header>
            <h1 class="text-2xl font-bold">
                {{ t("pages.delivery.title") }}
            </h1>
            <p class="mt-1 text-sm text-base-content/70">
                {{ t("pages.delivery.hint") }}
            </p>
        </header>

        <div class="flex flex-wrap gap-2 border-b border-base-300 pb-2">
            <RouterLink
                to="/delivery/gitops"
                class="btn btn-sm"
                :class="activeTab === 'gitops' ? 'btn-primary' : 'btn-ghost'"
            >
                {{ t("pages.delivery.tabs.gitops") }}
            </RouterLink>
            <RouterLink
                to="/delivery/pipeline"
                class="btn btn-sm"
                :class="activeTab === 'pipeline' ? 'btn-primary' : 'btn-ghost'"
            >
                {{ t("pages.delivery.tabs.pipeline") }}
            </RouterLink>
        </div>

        <router-view />
    </section>
</template>
