<script setup lang="ts">

import { computed, onMounted, ref } from "vue";

import { useI18n } from "vue-i18n";

import { RouterLink, useRouter } from "vue-router";



import PageLayout from "../components/layout/PageLayout.vue";

import ConfirmModal from "../components/ui/ConfirmModal.vue";

import ErrorAlert from "../components/ui/ErrorAlert.vue";

import LoadingSpinner from "../components/ui/LoadingSpinner.vue";

import YamlEditor from "../components/ui/YamlEditor.vue";

import { useAuthStore } from "../stores/Auth";

import { useClusterStore } from "../stores/Cluster";



const { t } = useI18n();

const router = useRouter();

const store = useClusterStore();

const auth = useAuthStore();

const manifestYaml = ref(`name: minimal



services:

  web:

    image: nginx:1.27-alpine

    ports:

      - "8080:80"

`);

const confirmModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const applySuccessMessage = ref("");



const onlineNodes = computed(() => store.clusterStatus?.summary?.onlineNodes ?? 0);

const totalNodes = computed(() => store.clusterStatus?.summary?.nodes ?? 0);



const showNoNodesBanner = computed(() =>

    Boolean(store.clusterStatus)

    && onlineNodes.value === 0

);



const showSchedulingHelp = computed(() => {

    if (!store.error) {

        return false;

    }



    if (typeof store.error === "string") {

        return false;

    }



    return store.error.i18n === "errors.noEligibleNode";

});



const isApplying = computed(() => store.loading);



onMounted(() => {

    void store.refreshClusterStatus();

});



/**

 * Opens the deploy confirmation modal.

 *

 * @returns Nothing.

 */

function requestApplyManifest(): void {

    if (!manifestYaml.value.trim() || isApplying.value) {

        return;

    }



    applySuccessMessage.value = "";

    confirmModalRef.value?.open();

}



/**

 * Submits the manifest editor contents to the control plane.

 *

 * @returns Nothing.

 */

async function confirmApplyManifest(): Promise<void> {

    applySuccessMessage.value = "";



    const result = await store.applyManifest(manifestYaml.value);



    if (result.runId) {

        await router.push(`/runs/${result.runId}`);

        return;

    }



    applySuccessMessage.value = t("pages.deploy.applySuccessNoRun");

    await store.refreshClusterStatus();

}

</script>



<template>

    <PageLayout title-key="pages.deploy.title" hint-key="pages.deploy.hint">

        <div

            v-if="showNoNodesBanner"

            class="alert border border-warning/30 bg-warning/10"

        >

            <div class="flex w-full flex-col gap-3">

                <div>

                    <p class="font-semibold">

                        {{ t("pages.deploy.noNodesBannerTitle") }}

                    </p>

                    <p class="mt-1 text-sm text-base-content/80">

                        {{ t("pages.deploy.noNodesBannerDescription") }}

                    </p>

                    <p class="mt-2 text-xs text-base-content/60">

                        {{ t("pages.deploy.noNodesBannerDevHint") }}

                    </p>

                    <p

                        v-if="totalNodes > 0"

                        class="mt-2 text-sm text-base-content/70"

                    >

                        {{ t("pages.cluster.healthNodesOffline") }}

                    </p>

                </div>

                <div class="flex flex-wrap gap-2">

                    <RouterLink to="/nodes" class="btn btn-outline btn-sm">

                        {{ t("pages.deploy.actionViewNodes") }}

                    </RouterLink>

                    <RouterLink

                        v-if="auth.hasPermission('nodes:provision')"

                        to="/nodes/new"

                        class="btn btn-primary btn-sm"

                    >

                        {{ t("pages.deploy.actionProvisionNode") }}

                    </RouterLink>

                    <RouterLink to="/cluster" class="btn btn-ghost btn-sm">

                        {{ t("pages.deploy.actionOpenCluster") }}

                    </RouterLink>

                </div>

            </div>

        </div>



        <div

            v-if="isApplying"

            class="alert border border-info/30 bg-info/10"

            role="status"

        >

            <LoadingSpinner />

            <div>

                <p class="font-semibold">

                    {{ t("pages.deploy.applyingTitle") }}

                </p>

                <p class="mt-1 text-sm text-base-content/80">

                    {{ t("pages.deploy.applyingDescription") }}

                </p>

            </div>

        </div>



        <ErrorAlert :error="store.error" />



        <p v-if="applySuccessMessage" class="alert alert-success">

            {{ applySuccessMessage }}

            <RouterLink to="/runs" class="link link-hover ml-2 font-medium">

                {{ t("pages.deploy.viewRuns") }}

            </RouterLink>

        </p>



        <div

            v-if="showSchedulingHelp"

            class="card border border-error/20 bg-error/5 shadow-sm"

        >

            <div class="card-body gap-4">

                <div>

                    <h2 class="text-base font-semibold">

                        {{ t("pages.deploy.schedulingHelpTitle") }}

                    </h2>

                    <p class="mt-1 text-sm text-base-content/80">

                        {{ t("pages.deploy.schedulingHelpDescription") }}

                    </p>

                </div>

                <div class="flex flex-wrap gap-2">

                    <RouterLink to="/nodes" class="btn btn-outline btn-sm">

                        {{ t("pages.deploy.actionViewNodes") }}

                    </RouterLink>

                    <RouterLink

                        v-if="auth.hasPermission('nodes:provision')"

                        to="/nodes/new"

                        class="btn btn-primary btn-sm"

                    >

                        {{ t("pages.deploy.actionProvisionNode") }}

                    </RouterLink>

                    <RouterLink to="/cluster" class="btn btn-ghost btn-sm">

                        {{ t("pages.deploy.actionOpenCluster") }}

                    </RouterLink>

                </div>

            </div>

        </div>



        <div class="card bg-base-100 shadow">

            <div class="card-body gap-4">

                <YamlEditor v-model="manifestYaml" :disabled="isApplying" />

                <div class="flex flex-wrap items-center gap-3">

                    <button

                        type="button"

                        class="btn btn-primary"

                        :disabled="isApplying || !manifestYaml.trim()"

                        @click="requestApplyManifest"

                    >

                        <span v-if="isApplying" class="loading loading-spinner loading-sm" />

                        {{

                            isApplying

                                ? t("pages.deploy.applyingTitle")

                                : t("pages.deploy.applyManifest")

                        }}

                    </button>

                    <RouterLink to="/runs" class="btn btn-ghost btn-sm">

                        {{ t("pages.deploy.viewRuns") }}

                    </RouterLink>

                </div>

            </div>

        </div>



        <ConfirmModal

            ref="confirmModalRef"

            title-key="pages.deploy.applyConfirmTitle"

            confirm-label-key="pages.deploy.applyManifest"

            :handler="confirmApplyManifest"

        >

            <div class="flex flex-col gap-3 py-4 text-sm text-base-content/90">

                <p>{{ t("pages.deploy.applyConfirmIntro") }}</p>

                <ul class="list-disc space-y-2 pl-5">

                    <li>{{ t("pages.deploy.applyConfirmPointDeploy") }}</li>

                    <li>{{ t("pages.deploy.applyConfirmPointNotGitops") }}</li>

                    <li>{{ t("pages.deploy.applyConfirmPointOverwrite") }}</li>

                </ul>

            </div>

        </ConfirmModal>

    </PageLayout>

</template>

