<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshSecrets();
});
</script>

<template>
    <section>
        <h2>{{ t("secrets") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Scope</th>
                        <th>Keys</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="secret in store.secrets" :key="secret.id">
                        <td>{{ secret.name }}</td>
                        <td>{{ secret.scope }}</td>
                        <td>{{ secret.keys.join(", ") }}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
