<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import GitOpsRevisionsPanel from "../components/gitops/GitOpsRevisionsPanel.vue";
import { useClusterStore } from "../stores/Cluster";

const route = useRoute();
const store = useClusterStore();

const compactChrome = computed(() => Boolean(route.meta.deliveryTab));

onMounted(() => {
    void store.refreshGitOpsRevisions();
});
</script>

<template>
    <PageLayout
        v-if="!compactChrome"
        title-key="pages.gitops.title"
        hint-key="pages.gitops.hint"
    >
        <GitOpsRevisionsPanel />
    </PageLayout>
    <div v-else class="flex flex-col gap-6">
        <GitOpsRevisionsPanel />
    </div>
</template>
