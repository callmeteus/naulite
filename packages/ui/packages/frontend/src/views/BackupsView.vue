<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshBackups();
});
</script>

<template>
    <section>
        <h2>{{ t("backups") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Volume</th>
                        <th>Status</th>
                        <th>Destination</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="backup in store.backups" :key="backup.id">
                        <td>{{ backup.id }}</td>
                        <td>{{ backup.volumeName }}</td>
                        <td>{{ backup.status }}</td>
                        <td>{{ backup.destination ?? "-" }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
