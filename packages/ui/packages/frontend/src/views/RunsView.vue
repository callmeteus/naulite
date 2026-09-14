<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import RunsListPanel from "../components/runs/RunsListPanel.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const route = useRoute();
const auth = useAuthStore();

const compactChrome = computed(() => Boolean(route.meta.deliveryTab));
const canBuild = computed(() => auth.hasPermission("runs:write"));
const canDeploy = computed(() => auth.hasPermission("manifests:apply"));
</script>

<template>
    <PageLayout
        v-if="!compactChrome"
        title-key="pages.runs.title"
        hint-key="pages.runs.hint"
    >
        <template #actions>
            <RouterLink
                v-if="canDeploy"
                to="/runs/deploy"
                class="btn btn-outline btn-sm"
            >
                {{ t("pages.runs.quickDeploy") }}
            </RouterLink>
            <RouterLink
                v-if="canBuild"
                to="/runs/build"
                class="btn btn-primary btn-sm"
            >
                {{ t("pages.runs.buildTrigger") }}
            </RouterLink>
        </template>

        <RunsListPanel />
    </PageLayout>
    <div v-else class="flex flex-col gap-4">
        <div class="flex flex-wrap justify-end gap-2">
            <RouterLink
                v-if="canDeploy"
                to="/runs/deploy"
                class="btn btn-outline btn-sm"
            >
                {{ t("pages.runs.quickDeploy") }}
            </RouterLink>
            <RouterLink
                v-if="canBuild"
                to="/runs/build"
                class="btn btn-primary btn-sm"
            >
                {{ t("pages.runs.buildTrigger") }}
            </RouterLink>
        </div>
        <RunsListPanel />
    </div>
</template>
