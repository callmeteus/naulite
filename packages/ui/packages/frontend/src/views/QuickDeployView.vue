<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import ManifestApplyFields from "../components/manifest/ManifestApplyFields.vue";
import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useManifestApply } from "../composables/useManifestApply";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const {
    manifestYaml,
    manifestVars,
    manifestVarNames,
    applying,
    applyError,
    submitApply
} = useManifestApply();

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
 * Submits the manifest asynchronously and opens the pipeline run page.
 *
 * @returns Nothing.
 */
async function submitDeploy(): Promise<void> {
    await submitApply(router);
}
</script>

<template>
  <PageLayout title-key="pages.runs.quickDeployTitle" hint-key="pages.runs.quickDeployHint">
    <template #actions>
      <RouterLink to="/runs" class="btn btn-ghost btn-sm">
        {{ t("pages.runs.backToRuns") }}
      </RouterLink>
    </template>

    <div class="mx-auto w-full max-w-4xl">
      <ErrorAlert :error="applyError || store.error" />

      <ManifestApplyFields
        v-model="manifestYaml"
        :disabled="applying || !canDeploy"
        footer-note-key="pages.runs.quickDeployFollowRun"
      >
        <template #intro>
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
            <p class="mt-1 text-base-content/80">
              {{ t("pages.runs.quickDeployNoNodesDescription") }}
            </p>
            <RouterLink to="/nodes" class="link link-primary mt-2 inline-block">
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
          <div
            v-if="manifestVarNames.length > 0"
            class="card bg-base-100 shadow"
          >
            <div class="card-body gap-4">
              <h2 class="text-base font-semibold">{{ t("pages.deploy.varsTitle") }}</h2>
              <p class="text-sm text-base-content/70">{{ t("pages.deploy.varsHint") }}</p>
              <div class="grid gap-3 sm:grid-cols-2">
                <label
                  v-for="varName in manifestVarNames"
                  :key="varName"
                  class="form-control w-full"
                >
                  <span class="label-text font-mono text-sm">{{ varName }}</span>
                  <input
                    v-model="manifestVars[varName]"
                    type="text"
                    class="input input-bordered input-sm w-full"
                    :disabled="applying || !canDeploy"
                  />
                </label>
              </div>
            </div>
          </div>
        </template>

        <template #actions>
          <div class="flex flex-wrap justify-end gap-2">
            <RouterLink to="/runs" class="btn" :class="{ 'btn-disabled': applying }">
              {{ t("common.cancel") }}
            </RouterLink>
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
        </template>
      </ManifestApplyFields>
    </div>
  </PageLayout>
</template>
