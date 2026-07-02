<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshClusterStatus();
});
</script>

<template>
    <section>
        <h2>{{ t("cluster") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else-if="store.clusterStatus" class="panel">
            <p>Status: {{ store.clusterStatus.health.status }}</p>
            <p>Nodes: {{ store.clusterStatus.summary?.nodes ?? store.clusterStatus.health.nodeCount }}</p>
            <p>Services: {{ store.clusterStatus.summary?.services ?? store.clusterStatus.health.serviceCount }}</p>
            <p>Revision: {{ store.clusterStatus.revision ?? "-" }}</p>
        </div>
    </section>
</template>
