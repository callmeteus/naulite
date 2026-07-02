<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshOverview();
});
</script>

<template>
    <section>
        <h2>{{ t("nodes") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Hostname</th>
                        <th>Status</th>
                        <th>CPU Used</th>
                        <th>Memory Used</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="node in store.nodes" :key="node.id">
                        <td>{{ node.id }}</td>
                        <td>{{ node.hostname }}</td>
                        <td>{{ node.status }}</td>
                        <td>{{ node.resources.cpuMillisUsed }}</td>
                        <td>{{ node.resources.memoryMbUsed }} MB</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
