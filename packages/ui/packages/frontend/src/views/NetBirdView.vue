<script setup lang="ts">
import { onMounted } from "vue";

import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();

onMounted(() => {
    void store.refreshNetBird();
});
</script>

<template>
    <section>
        <h2>{{ t("netbird") }}</h2>
        <p class="hint">{{ t("netbirdHint") }}</p>
        <p v-if="store.loading">Loading...</p>
        <p v-else-if="store.error" class="error">{{ store.error }}</p>
        <div v-else class="panel-grid">
            <div class="panel">
                <h3>{{ t("netbirdTopology") }}</h3>
                <p>{{ t("netbirdGroupsCount") }}: {{ store.netBirdTopology?.groups.length ?? 0 }}</p>
                <p>{{ t("netbirdDevicesCount") }}: {{ store.netBirdTopology?.devices.length ?? 0 }}</p>
            </div>

            <div class="panel">
                <h3>{{ t("netbirdDevices") }}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                            <th>Connected</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="device in store.netBirdDevices" :key="device.id">
                            <td>{{ device.id }}</td>
                            <td>{{ device.name }}</td>
                            <td>{{ device.connected ?? "-" }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="panel">
                <h3>{{ t("netbirdGroups") }}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="group in store.netBirdGroups" :key="group.id">
                            <td>{{ group.id }}</td>
                            <td>{{ group.name }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <div class="panel">
                <h3>{{ t("netbirdAcls") }}</h3>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Name</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="acl in store.netBirdAcls" :key="acl.id">
                            <td>{{ acl.id }}</td>
                            <td>{{ acl.name ?? "-" }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </section>
</template>
