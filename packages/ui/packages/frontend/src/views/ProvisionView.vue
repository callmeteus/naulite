<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";

import type { NodeProvision } from "@platform/sdk";
import { t } from "../ui/Translate";
import { useClusterStore } from "../stores/Cluster";

const store = useClusterStore();
const provider = ref("aws");
const instanceType = ref("t3.small");
const amiId = ref("");
const region = ref("");
const count = ref(1);
const activeProvision = ref<NodeProvision | null>(null);
const provisionMessage = ref("");
let pollTimer: ReturnType<typeof setInterval> | null = null;

onBeforeUnmount(() => {
    stopPolling();
});

/**
 * Stops provision status polling.
 *
 * @returns Nothing.
 */
function stopPolling(): void {
    if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
    }
}

/**
 * Polls node provision status until it reaches a terminal state.
 *
 * @param provisionId Node provision identifier
 * @returns Nothing.
 */
function startPolling(provisionId: string): void {
    stopPolling();

    pollTimer = setInterval(() => {
        void store.getNodeProvision(provisionId).then((provision) => {
            activeProvision.value = provision;

            if (
                provision.status === "registered" ||
                provision.status === "failed" ||
                provision.status === "terminated"
            ) {
                stopPolling();
            }
        });
    }, 3000);
}

/**
 * Submits a node provision request to the control plane.
 *
 * @returns Nothing.
 */
async function submitProvision(): Promise<void> {
    const trimmedAmi = amiId.value.trim();
    const trimmedType = instanceType.value.trim();

    if (!trimmedAmi || !trimmedType) {
        return;
    }

    provisionMessage.value = "";
    activeProvision.value = null;

    const provision = await store.provisionNode({
        provider: provider.value.trim() || "aws",
        instanceType: trimmedType,
        amiId: trimmedAmi,
        count: count.value,
        region: region.value.trim() || undefined
    });

    activeProvision.value = provision;
    provisionMessage.value = t("provisionStarted");
    startPolling(provision.id);
}
</script>

<template>
    <section>
        <h2>{{ t("provision") }}</h2>
        <p class="hint">{{ t("provisionHint") }}</p>
        <p v-if="store.error" class="error">{{ store.error }}</p>

        <div class="panel">
            <form class="create-form provision-form" @submit.prevent="submitProvision">
                <label>
                    {{ t("provisionProvider") }}
                    <input v-model="provider" type="text" />
                </label>
                <label>
                    {{ t("provisionInstanceType") }}
                    <input v-model="instanceType" type="text" />
                </label>
                <label>
                    {{ t("provisionAmiId") }}
                    <input v-model="amiId" type="text" :placeholder="t('provisionAmiPlaceholder')" />
                </label>
                <label>
                    {{ t("provisionRegion") }}
                    <input v-model="region" type="text" :placeholder="t('provisionRegionPlaceholder')" />
                </label>
                <label>
                    {{ t("provisionCount") }}
                    <input v-model.number="count" type="number" min="1" max="10" />
                </label>
                <button type="submit" :disabled="store.loading || !amiId.trim() || !instanceType.trim()">
                    {{ t("provisionSubmit") }}
                </button>
            </form>

            <p v-if="provisionMessage" class="hint">{{ provisionMessage }}</p>

            <div v-if="activeProvision" class="panel-grid">
                <div>
                    <p>ID: {{ activeProvision.id }}</p>
                    <p>{{ t("runsStatusFilter") }}: {{ activeProvision.status }}</p>
                    <p v-if="activeProvision.cloudInstanceId">
                        {{ t("provisionCloudInstance") }}: {{ activeProvision.cloudInstanceId }}
                    </p>
                    <p v-if="activeProvision.nodeId">{{ t("provisionNodeId") }}: {{ activeProvision.nodeId }}</p>
                    <p v-if="activeProvision.error" class="error">{{ activeProvision.error }}</p>
                </div>
            </div>
        </div>
    </section>
</template>
