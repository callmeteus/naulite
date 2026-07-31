<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import PlatformTerminalTabs, { type TerminalPlatform } from "../components/ui/PlatformTerminalTabs.vue";
import RelationSelect from "../components/ui/RelationSelect.vue";
import {
    NodeProvisionProvider,
    NodeProvisionProviderRelation
} from "../domain/NodeProvisionProvider";
import { useClusterStore } from "../stores/Cluster";

type AddNodeMode = "manual" | "cloud";

const { t } = useI18n();
const router = useRouter();
const store = useClusterStore();

const mode = ref<AddNodeMode>("manual");
const provider = ref<NodeProvisionProvider>(NodeProvisionProvider.AWS);
const instanceType = ref("t3.small");
const amiId = ref("");
const region = ref("");
const count = ref(1);
const terminalPlatform = ref<TerminalPlatform>("windows");

const controlPlaneUrl = import.meta.env.VITE_CONTROL_PLANE_URL ?? "http://127.0.0.1:18080";

const setupKeyCommandWindows = `(Invoke-RestMethod ${controlPlaneUrl}/bootstrap/setup-key).setupKey`;
const setupKeyCommandUnix = `curl -fsSL ${controlPlaneUrl}/bootstrap/setup-key`;

const manualRunCommandWindows = [
    `$env:NAULITE_CP_URL="${controlPlaneUrl}"`,
    `$env:NODE_ID="my-node"`,
    `$env:AGENT_URL="http://127.0.0.1:9470"`,
    ".\\packages\\agent\\zig-out\\bin\\naulite-agent.exe"
].join("\n");

const manualRunCommandUnix = [
    `export NAULITE_CP_URL="${controlPlaneUrl}"`,
    `export NODE_ID="my-node"`,
    `export AGENT_URL="http://127.0.0.1:9470"`,
    "./packages/agent/zig-out/bin/naulite-agent"
].join("\n");

const psLineContinuation = "`";

const installScriptCommandWindows = [
    `$setupKey = (Invoke-RestMethod ${controlPlaneUrl}/bootstrap/setup-key).setupKey`,
    `.\\bootstrap\\agent-install.ps1 ${psLineContinuation}`,
    `  -HostUrl "${controlPlaneUrl}" ${psLineContinuation}`,
    "  -SetupKey $setupKey"
].join("\n");

const installScriptCommandUnix = [
    `SETUP_KEY=$(curl -fsSL ${controlPlaneUrl}/bootstrap/setup-key | jq -r .setupKey)`,
    "sudo bash bootstrap/agent-install.sh \\",
    `  --host ${controlPlaneUrl} \\`,
    "  --setup-key \"$SETUP_KEY\""
].join("\n");

const canSubmitCloud = computed(() =>
    amiId.value.trim().length > 0
    && instanceType.value.trim().length > 0
    && count.value >= 1
    && count.value <= 10
);

/**
 * Submits the cloud provision request and opens the status page.
 *
 * @returns Nothing.
 */
async function submitCloudProvision(): Promise<void> {
    if (!canSubmitCloud.value) {
        return;
    }

    const provision = await store.provisionNode({
        provider: provider.value,
        instanceType: instanceType.value.trim(),
        amiId: amiId.value.trim(),
        count: count.value,
        region: region.value.trim() || undefined
    });

    await router.push(`/nodes/provisions/${provision.id}`);
}
</script>

<template>
    <PageLayout title-key="pages.provision.newTitle" hint-key="pages.provision.newHint">
        <template #actions>
            <RouterLink to="/nodes" class="btn btn-ghost btn-sm">
                {{ t("pages.provision.backToList") }}
            </RouterLink>
            <RouterLink to="/nodes" class="btn btn-outline btn-sm">
                {{ t("pages.provision.viewNodes") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="store.error" />

        <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div class="tabs tabs-boxed w-fit">
                <button
                    type="button"
                    class="tab"
                    :class="{ 'tab-active': mode === 'manual' }"
                    @click="mode = 'manual'"
                >
                    {{ t("pages.provision.modeManual") }}
                </button>
                <button
                    type="button"
                    class="tab"
                    :class="{ 'tab-active': mode === 'cloud' }"
                    @click="mode = 'cloud'"
                >
                    {{ t("pages.provision.modeCloud") }}
                </button>
            </div>

            <div v-if="mode === 'manual'" class="flex flex-col gap-6">
                <div class="alert border border-info/20 bg-info/10 text-sm">
                    <span>{{ t("pages.provision.manualIntro") }}</span>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.provision.manualDevTitle") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.provision.manualDevHint") }}
                            </p>
                        </div>
                        <ol class="list-decimal space-y-2 pl-5 text-sm text-base-content/80">
                            <li>{{ t("pages.provision.manualDevStep1") }}</li>
                            <li>{{ t("pages.provision.manualDevStep2") }}</li>
                            <li>{{ t("pages.provision.manualDevStep3") }}</li>
                        </ol>
                    </div>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.provision.manualInstallTitle") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.provision.manualInstallHint") }}
                            </p>
                        </div>

                        <PlatformTerminalTabs v-model="terminalPlatform" />

                        <div class="space-y-2">
                            <p class="text-sm font-medium">
                                {{ t("pages.provision.manualSetupKeyTitle") }}
                            </p>
                            <p class="text-xs text-base-content/60">
                                {{ t("pages.provision.manualSetupKeyHint") }}
                            </p>
                            <pre class="overflow-x-auto rounded-lg bg-base-300 p-3 text-xs"><code>{{
                                terminalPlatform === "windows"
                                    ? setupKeyCommandWindows
                                    : setupKeyCommandUnix
                            }}</code></pre>
                        </div>

                        <div class="space-y-2">
                            <p class="text-sm font-medium">
                                {{ t("pages.provision.manualInstallerTitle") }}
                            </p>
                            <pre class="overflow-x-auto rounded-lg bg-base-300 p-3 text-xs"><code>{{
                                terminalPlatform === "windows"
                                    ? installScriptCommandWindows
                                    : installScriptCommandUnix
                            }}</code></pre>
                        </div>

                        <div class="space-y-2">
                            <p class="text-sm font-medium">
                                {{ t("pages.provision.manualBinaryTitle") }}
                            </p>
                            <p class="text-xs text-base-content/60">
                                {{ t("pages.provision.manualBinaryHint") }}
                            </p>
                            <pre class="overflow-x-auto rounded-lg bg-base-300 p-3 text-xs"><code>{{
                                terminalPlatform === "windows"
                                    ? manualRunCommandWindows
                                    : manualRunCommandUnix
                            }}</code></pre>
                        </div>

                        <div class="rounded-lg border border-base-300 bg-base-200/40 p-4 text-sm">
                            <p class="font-medium">
                                {{ t("pages.provision.manualRequirementsTitle") }}
                            </p>
                            <ul class="mt-2 list-disc space-y-1 pl-5 text-base-content/80">
                                <li>{{ t("pages.provision.manualRequirementDocker") }}</li>
                                <li>{{ t("pages.provision.manualRequirementReachable", { cpUrl: controlPlaneUrl }) }}</li>
                                <li>{{ t("pages.provision.manualRequirementAgentPort") }}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="flex flex-wrap justify-end gap-3">
                    <RouterLink to="/nodes" class="btn btn-primary">
                        {{ t("pages.provision.manualCheckNodes") }}
                    </RouterLink>
                </div>
            </div>

            <form v-else class="flex flex-col gap-6" @submit.prevent="submitCloudProvision">
                <div class="alert border border-warning/20 bg-warning/10 text-sm">
                    <span>{{ t("pages.provision.cloudIntro") }}</span>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.provision.sectionProvider") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.provision.sectionProviderHint") }}
                            </p>
                        </div>

                        <RelationSelect
                            v-model="provider"
                            :relation="NodeProvisionProviderRelation"
                            :disabled="store.loading"
                        >
                            <template #label>
                                {{ t("pages.provision.provider") }}
                            </template>
                        </RelationSelect>

                        <label class="form-control w-full">
                            <span class="label-text">{{ t("pages.provision.region") }}</span>
                            <input
                                v-model="region"
                                type="text"
                                class="input input-bordered w-full"
                                :placeholder="t('pages.provision.regionPlaceholder')"
                                :disabled="store.loading"
                            />
                            <span class="label-text-alt mt-1 text-base-content/60">
                                {{ t("pages.provision.regionHint") }}
                            </span>
                        </label>
                    </div>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.provision.sectionInstance") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.provision.sectionInstanceHint") }}
                            </p>
                        </div>

                        <label class="form-control w-full">
                            <span class="label-text">{{ t("pages.provision.amiId") }}</span>
                            <input
                                v-model="amiId"
                                type="text"
                                class="input input-bordered w-full font-mono"
                                :placeholder="t('pages.provision.amiPlaceholder')"
                                :disabled="store.loading"
                                required
                            />
                            <span class="label-text-alt mt-1 text-base-content/60">
                                {{ t("pages.provision.amiHint") }}
                            </span>
                        </label>

                        <label class="form-control w-full">
                            <span class="label-text">{{ t("pages.provision.instanceType") }}</span>
                            <input
                                v-model="instanceType"
                                type="text"
                                class="input input-bordered w-full font-mono"
                                placeholder="t3.small"
                                :disabled="store.loading"
                                required
                            />
                            <span class="label-text-alt mt-1 text-base-content/60">
                                {{ t("pages.provision.instanceTypeHint") }}
                            </span>
                        </label>
                    </div>
                </div>

                <div class="card bg-base-100 shadow">
                    <div class="card-body gap-4">
                        <div>
                            <h2 class="text-lg font-semibold">
                                {{ t("pages.provision.sectionScale") }}
                            </h2>
                            <p class="text-sm text-base-content/70">
                                {{ t("pages.provision.sectionScaleHint") }}
                            </p>
                        </div>

                        <label class="form-control w-full max-w-xs">
                            <span class="label-text">{{ t("pages.provision.count") }}</span>
                            <input
                                v-model.number="count"
                                type="number"
                                min="1"
                                max="10"
                                class="input input-bordered w-full"
                                :disabled="store.loading"
                            />
                        </label>
                    </div>
                </div>

                <div class="flex flex-wrap items-center justify-end gap-3 border-t border-base-300 pt-4">
                    <RouterLink to="/nodes" class="btn btn-ghost">
                        {{ t("common.cancel") }}
                    </RouterLink>
                    <button
                        type="submit"
                        class="btn btn-primary"
                        :class="{ loading: store.loading }"
                        :disabled="store.loading || !canSubmitCloud"
                    >
                        {{ t("pages.provision.submit") }}
                    </button>
                </div>
            </form>
        </div>
    </PageLayout>
</template>
