<script setup lang="ts">
import type { NotificationProviderStatus, NotificationTestResult } from "@platform/sdk";
import { onMounted, ref } from "vue";

import { platformClient } from "../api/Client";
import { t } from "../ui/Translate";

const providers = ref<NotificationProviderStatus[]>([]);
const testResults = ref<NotificationTestResult[]>([]);
const loading = ref(false);
const testing = ref(false);
const error = ref("");

/**
 * Loads registered notification providers from the admin API.
 *
 * @returns Nothing.
 */
async function refreshProviders(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        const response = await platformClient.listNotificationProviders();
        providers.value = response.providers;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Sends a test notification to every registered provider.
 *
 * @returns Nothing.
 */
async function sendTestPing(): Promise<void> {
    testing.value = true;
    error.value = "";
    testResults.value = [];

    try {
        const response = await platformClient.testNotificationProviders();
        testResults.value = response.providers;
        await refreshProviders();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        testing.value = false;
    }
}

onMounted(() => {
    void refreshProviders();
});
</script>

<template>
    <section>
        <h2>{{ t("notifications") }}</h2>
        <p class="hint">{{ t("notificationsHint") }}</p>

        <div class="actions">
            <button type="button" :disabled="loading" @click="refreshProviders">
                {{ t("notificationsRefresh") }}
            </button>
            <button type="button" :disabled="testing || providers.length === 0" @click="sendTestPing">
                {{ testing ? t("notificationsTesting") : t("notificationsTest") }}
            </button>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <table v-if="providers.length > 0">
            <thead>
                <tr>
                    <th>{{ t("notificationsProvider") }}</th>
                    <th>{{ t("notificationsUrlConfigured") }}</th>
                    <th>{{ t("notificationsSecretConfigured") }}</th>
                    <th>{{ t("notificationsEnvVars") }}</th>
                </tr>
            </thead>
            <tbody>
                <tr v-for="provider in providers" :key="provider.id">
                    <td>{{ provider.id }}</td>
                    <td>{{ provider.urlConfigured ? t("yes") : t("no") }}</td>
                    <td>{{ provider.secretConfigured ? t("yes") : t("no") }}</td>
                    <td>
                        <code>{{ [...provider.env.urlVars, ...provider.env.secretVars].join(", ") }}</code>
                    </td>
                </tr>
            </tbody>
        </table>

        <p v-else-if="!loading" class="empty">{{ t("notificationsEmpty") }}</p>

        <div v-if="testResults.length > 0" class="test-results">
            <h3>{{ t("notificationsTestResults") }}</h3>
            <ul>
                <li v-for="result in testResults" :key="result.id">
                    <strong>{{ result.id }}</strong>:
                    {{ result.ok ? t("notificationsTestOk") : t("notificationsTestFailed") }}
                    <span v-if="result.error"> - {{ result.error }}</span>
                </li>
            </ul>
        </div>
    </section>
</template>
