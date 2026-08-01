<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const serviceName = ref("");
const provider = ref("");
const registry = ref("");
const submitting = ref(false);

const canBuild = computed(() => auth.hasPermission("runs:write"));
const hasServices = computed(() => store.services.length > 0);
const canSubmit = computed(() =>
    canBuild.value
    && serviceName.value.trim().length > 0
    && !submitting.value
    && !store.loading
);

onMounted(() => {
    if (canBuild.value) {
        void store.refreshOverview();
    }
});

/**
 * Triggers a service image build and opens the resulting pipeline run.
 *
 * @returns Nothing.
 */
async function triggerBuild(): Promise<void> {
    const trimmedService = serviceName.value.trim();

    if (!trimmedService || !canBuild.value) {
        return;
    }

    submitting.value = true;

    try {
        const result = await store.triggerBuild({
            serviceName: trimmedService,
            provider: provider.value.trim() || undefined,
            registry: registry.value.trim() || undefined
        });

        if (result.runId) {
            await router.push(`/runs/${result.runId}`);
            return;
        }

        await router.push("/runs?kind=ci_build");
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.runs.buildTitle" hint-key="pages.runs.buildHint">
        <template #actions>
            <RouterLink to="/runs" class="btn btn-ghost btn-sm">
                {{ t("pages.runs.backToRuns") }}
            </RouterLink>
        </template>

        <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div class="alert border border-info/20 bg-info/10 text-sm">
                <span>{{ t("pages.runs.buildIntro") }}</span>
            </div>

            <ol class="list-decimal space-y-2 pl-5 text-sm text-base-content/80">
                <li>{{ t("pages.runs.buildStep1") }}</li>
                <li>{{ t("pages.runs.buildStep2") }}</li>
                <li>{{ t("pages.runs.buildStep3") }}</li>
            </ol>

            <div
                v-if="!hasServices"
                class="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm"
            >
                <p>{{ t("pages.runs.buildNoServices") }}</p>
                <RouterLink to="/runs/deploy" class="link link-primary mt-2 inline-block">
                    {{ t("pages.runs.buildGoDeploy") }}
                </RouterLink>
            </div>

            <p v-if="!canBuild" class="text-sm text-base-content/70">
                {{ t("pages.runs.buildNoPermission") }}
            </p>

            <ErrorAlert :error="store.error" />

            <form
                v-if="canBuild"
                class="card bg-base-100 shadow"
                @submit.prevent="triggerBuild"
            >
                <div class="card-body grid gap-4 md:grid-cols-2">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.runs.buildServiceName") }}</span>
                        <select
                            v-if="hasServices"
                            v-model="serviceName"
                            class="select select-bordered w-full"
                            required
                        >
                            <option disabled value="">
                                {{ t("pages.runs.buildServicePlaceholder") }}
                            </option>
                            <option
                                v-for="service in store.services"
                                :key="service.name"
                                :value="service.name"
                            >
                                {{ service.name }}
                            </option>
                        </select>
                        <input
                            v-else
                            v-model="serviceName"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.runs.buildServicePlaceholder')"
                            required
                        />
                        <span class="label-text-alt mt-1 text-base-content/60">
                            {{ t("pages.runs.buildServiceHint") }}
                        </span>
                    </label>

                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.runs.buildProvider") }}</span>
                        <input
                            v-model="provider"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.runs.buildProviderPlaceholder')"
                        />
                        <span class="label-text-alt mt-1 text-base-content/60">
                            {{ t("pages.runs.buildProviderHint") }}
                        </span>
                    </label>

                    <label class="form-control w-full md:col-span-2">
                        <span class="label-text">{{ t("pages.runs.buildRegistry") }}</span>
                        <input
                            v-model="registry"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.runs.buildRegistryPlaceholder')"
                        />
                        <span class="label-text-alt mt-1 text-base-content/60">
                            {{ t("pages.runs.buildRegistryHint") }}
                        </span>
                    </label>
                </div>
            </form>

            <div class="flex flex-wrap justify-end gap-2">
                <RouterLink to="/runs" class="btn">
                    {{ t("common.cancel") }}
                </RouterLink>
                <RouterLink to="/container-registry" class="btn btn-ghost">
                    {{ t("pages.runs.buildViewRegistry") }}
                </RouterLink>
                <button
                    v-if="canBuild"
                    type="button"
                    class="btn btn-primary"
                    :class="{ loading: submitting || store.loading }"
                    :disabled="!canSubmit"
                    @click="triggerBuild"
                >
                    {{ t("pages.runs.buildTrigger") }}
                </button>
            </div>
        </div>
    </PageLayout>
</template>
