<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";

import ErrorAlert from "../ui/ErrorAlert.vue";
import { nauliteClient } from "../../api/Client";
import { parseApiError, type ParsedApiError } from "../../composables/useApiAction";

const { t } = useI18n();

const repositoryUrl = ref("");
const branch = ref("master");
const manifestPath = ref("luckymaker-ci.naulite.yml");
const commitSha = ref("");
const deliveryId = ref("");
const submitting = ref(false);
const error = ref<ParsedApiError | null>(null);
const resultJson = ref("");

/**
 * Dispatches a mock GitOps push webhook to the control plane.
 *
 * @returns Nothing.
 */
async function submitMockWebhook(): Promise<void> {
    submitting.value = true;
    error.value = null;
    resultJson.value = "";

    try {
        const payload: Record<string, unknown> = {
            repositoryUrl: repositoryUrl.value.trim(),
            branch: branch.value.trim(),
            manifestPath: manifestPath.value.trim(),
            repositoryFullName: "even7hq/luckymaker",
            event: "push"
        };

        if (commitSha.value.trim()) {
            payload.commitSha = commitSha.value.trim();
        }

        if (deliveryId.value.trim()) {
            payload.deliveryId = deliveryId.value.trim();
        }

        const response = await nauliteClient.gitOpsWebhookMock(payload);
        resultJson.value = JSON.stringify(response, null, 2);
    } catch (err) {
        error.value = parseApiError(err);
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <div class="card bg-base-200/40 shadow-sm">
        <div class="card-body gap-4">
            <div>
                <h2 class="text-lg font-semibold">
                    {{ t("pages.gitops.mockWebhookTitle") }}
                </h2>
                <p class="text-sm text-base-content/70">
                    {{ t("pages.gitops.mockWebhookHint") }}
                </p>
            </div>

            <ErrorAlert :error="error" />

            <div class="grid gap-3 md:grid-cols-2">
                <label class="form-control w-full">
                    <span class="label-text">{{ t("pages.gitops.mockWebhookRepositoryUrl") }}</span>
                    <input v-model="repositoryUrl" type="url" class="input input-bordered w-full" />
                </label>
                <label class="form-control w-full">
                    <span class="label-text">{{ t("common.tableColumns.branch") }}</span>
                    <input v-model="branch" type="text" class="input input-bordered w-full" />
                </label>
                <label class="form-control w-full">
                    <span class="label-text">{{ t("common.tableColumns.manifest") }}</span>
                    <input v-model="manifestPath" type="text" class="input input-bordered w-full" />
                </label>
                <label class="form-control w-full">
                    <span class="label-text">{{ t("common.tableColumns.commit") }}</span>
                    <input v-model="commitSha" type="text" class="input input-bordered w-full" />
                </label>
                <label class="form-control w-full md:col-span-2">
                    <span class="label-text">{{ t("pages.gitops.mockWebhookDeliveryId") }}</span>
                    <input v-model="deliveryId" type="text" class="input input-bordered w-full" />
                </label>
            </div>

            <div class="flex flex-wrap gap-2">
                <button
                    type="button"
                    class="btn btn-primary btn-sm"
                    :disabled="submitting"
                    @click="submitMockWebhook"
                >
                    {{ t("pages.gitops.mockWebhookSubmit") }}
                </button>
            </div>

            <pre
                v-if="resultJson"
                class="max-h-48 overflow-auto rounded-lg bg-base-300 p-3 text-xs"
            >{{ resultJson }}</pre>
        </div>
    </div>
</template>
