<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/translate.js";
import { useClusterStore } from "../stores/cluster.js";

const store = useClusterStore();

onMounted(() => {
    void store.refreshOverview();
});
</script>

<template>
    <section>
        <h2>{{ t("services") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Status</th>
                        <th>Desired Replicas</th>
                        <th>Lifecycle</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="service in store.services" :key="service.name">
                        <td>{{ service.name }}</td>
                        <td>{{ service.status }}</td>
                        <td>{{ service.desiredReplicas }}</td>
                        <td>{{ service.lifecycleStatus ?? "-" }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
