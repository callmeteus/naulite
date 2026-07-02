<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshInstances();
});
</script>

<template>
    <section>
        <h2>{{ t("instances") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Service</th>
                        <th>Node</th>
                        <th>Status</th>
                        <th>Image</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="instance in store.instances" :key="instance.id">
                        <td>{{ instance.id }}</td>
                        <td>{{ instance.serviceName }}</td>
                        <td>{{ instance.nodeId }}</td>
                        <td>{{ instance.status }}</td>
                        <td>{{ instance.image }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
