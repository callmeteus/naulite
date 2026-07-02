<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshVolumes();
});
</script>

<template>
    <section>
        <h2>{{ t("volumes") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Manifest</th>
                        <th>Status</th>
                        <th>Mount Path</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="volume in store.volumes" :key="volume.id">
                        <td>{{ volume.name }}</td>
                        <td>{{ volume.manifestName }}</td>
                        <td>{{ volume.status }}</td>
                        <td>{{ volume.mountPath }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
