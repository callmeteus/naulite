<script setup lang="ts">
import { ref } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const manifestYaml = ref(`name: minimal\n\nservices:\n  web:\n    image: nginx:1.27-alpine\n    ports:\n      - "8080:80"\n`);
const revision = ref("");

/**
 * Submits the manifest editor contents to the control plane.
 * 
 * @returns Nothing.
 */
async function applyManifest(): Promise<void> {
    revision.value = await store.applyManifest(manifestYaml.value);
}
</script>

<template>
    <section>
        <h2>{{ t("deploy") }}</h2>
        <p v-if="store.error" class="error">{{ store.error }}</p>
        <div class="panel">
            <textarea v-model="manifestYaml" />
            <p>
                <button :disabled="store.loading" @click="applyManifest">Apply manifest</button>
            </p>
            <p v-if="revision">Revision: {{ revision }}</p>
        </div>
    </section>
</template>
