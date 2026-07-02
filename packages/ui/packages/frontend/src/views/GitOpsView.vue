<script setup lang="ts">
import { onMounted, ref } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const rollbackId = ref("");

onMounted(() => {
    void store.refreshGitOpsRevisions();
});

/**
 * Rolls back to the revision typed in the form.
 *
 * @returns Nothing.
 */
async function rollback(): Promise<void> {
    if (!rollbackId.value) {
        return;
    }

    await store.rollbackGitOps(rollbackId.value);
}
</script>

<template>
    <section>
        <h2>{{ t("gitops") }}</h2>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel">
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Manifest</th>
                        <th>Branch</th>
                        <th>Commit</th>
                        <th>Applied At</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="revision in store.gitopsRevisions" :key="revision.id">
                        <td>{{ revision.id }}</td>
                        <td>{{ revision.manifestName }}</td>
                        <td>{{ revision.branch }}</td>
                        <td>{{ revision.commitSha }}</td>
                        <td>{{ revision.appliedAt }}</td>
                    </tr>
                </tbody>
            </table>
            <div class="actions">
                <input v-model="rollbackId" :placeholder="t('gitopsRollbackPlaceholder')" />
                <button type="button" @click="rollback">{{ t("gitopsRollback") }}</button>
            </div>
        </div>
    </section>
</template>
