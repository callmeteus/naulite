<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import { DEFAULT_MANIFEST_YAML } from "../../constants/defaultManifest";
import { parseApiError, type ParsedApiError } from "../../composables/useApiAction";
import { useAuthStore } from "../../stores/Auth";
import { useClusterStore } from "../../stores/Cluster";
import ErrorAlert from "../ui/ErrorAlert.vue";
import LoadingSpinner from "../ui/LoadingSpinner.vue";
import YamlEditor from "../ui/YamlEditor.vue";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const dialogRef = ref<HTMLDialogElement | null>(null);
const manifestYaml = ref(DEFAULT_MANIFEST_YAML);
const applying = ref(false);
const applyError = ref<ParsedApiError | null>(null);

const canDeploy = computed(() => auth.hasPermission("manifests:apply"));
const onlineNodes = computed(() => store.clusterStatus?.summary?.onlineNodes ?? 0);

const showNoNodesBanner = computed(() =>
    Boolean(store.clusterStatus)
    && onlineNodes.value === 0
);

onMounted(() => {
    if (canDeploy.value) {
        void store.refreshClusterStatus();
    }
});

/**
 * Opens the quick deploy dialog.
 *
 * @returns Nothing.
 */
function open(): void {
    applyError.value = null;
    dialogRef.value?.showModal();
}

/**
 * Closes the quick deploy dialog.
 *
 * @returns Nothing.
 */
function close(): void {
    dialogRef.value?.close();
}

/**
 * Submits the manifest asynchronously and opens the pipeline run page.
 *
 * @returns Nothing.
 */
async function submitDeploy(): Promise<void> {
    if (!manifestYaml.value.trim() || applying.value || !canDeploy.value) {
        return;
    }

    applying.value = true;
    applyError.value = null;
    store.error = null;

    try {
        const result = await store.applyManifest(manifestYaml.value, { async: true });

        close();

        if (result.runId) {
            await router.push(`/runs/${result.runId}`);
            return;
        }

        await router.push("/runs?kind=apply");
    } catch (err) {
        applyError.value = parseApiError(err);
    } finally {
        applying.value = false;
    }
}

defineExpose({
    open,
    close
});
</script>

<template>
    <dialog ref="dialogRef" class="modal">
        <div class="modal-box flex max-h-[90vh] max-w-4xl flex-col gap-4">
            <h3 class="text-lg font-bold">
                {{ t("pages.runs.quickDeployTitle") }}
            </h3>
            <p class="text-sm text-base-content/70">
                {{ t("pages.runs.quickDeployHint") }}
            </p>

            <div class="alert border border-info/20 bg-info/10 text-sm">
                <span>{{ t("pages.runs.quickDeployIntro") }}</span>
            </div>

            <ul class="list-disc space-y-1 pl-5 text-sm text-base-content/80">
                <li>{{ t("pages.deploy.applyConfirmPointDeploy") }}</li>
                <li>{{ t("pages.deploy.applyConfirmPointNotGitops") }}</li>
                <li>{{ t("pages.deploy.applyConfirmPointOverwrite") }}</li>
            </ul>

            <div
                v-if="showNoNodesBanner"
                class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm"
            >
                <p class="font-medium">{{ t("pages.runs.quickDeployNoNodesTitle") }}</p>
                <p class="mt-1 text-base-content/80">{{ t("pages.runs.quickDeployNoNodesDescription") }}</p>
                <RouterLink to="/nodes" class="link link-primary mt-2 inline-block" @click="close">
                    {{ t("pages.deploy.actionViewNodes") }}
                </RouterLink>
            </div>

            <div
                v-if="applying"
                class="flex items-center gap-2 text-sm text-base-content/70"
                role="status"
            >
                <LoadingSpinner />
                <span>{{ t("pages.runs.quickDeployStarting") }}</span>
            </div>

            <ErrorAlert :error="applyError || store.error" />

            <div class="min-h-0 flex-1 overflow-hidden">
                <YamlEditor
                    v-model="manifestYaml"
                    :disabled="applying || !canDeploy"
                    min-height="16rem"
                />
            </div>

            <p class="text-xs text-base-content/60">
                {{ t("pages.runs.quickDeployFollowRun") }}
            </p>

            <div class="modal-action mt-0 px-0">
                <button type="button" class="btn" :disabled="applying" @click="close">
                    {{ t("common.cancel") }}
                </button>
                <button
                    type="button"
                    class="btn btn-primary"
                    :class="{ loading: applying }"
                    :disabled="applying || !manifestYaml.trim() || !canDeploy"
                    @click="submitDeploy"
                >
                    {{ t("pages.deploy.applyManifest") }}
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="submit">{{ t("common.cancel") }}</button>
        </form>
    </dialog>
</template>
