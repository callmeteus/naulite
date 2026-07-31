<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import ErrorAlert from "../ui/ErrorAlert.vue";
import { useAuthStore } from "../../stores/Auth";
import { useClusterStore } from "../../stores/Cluster";

const { t } = useI18n();
const router = useRouter();
const auth = useAuthStore();
const store = useClusterStore();

const dialogRef = ref<HTMLDialogElement | null>(null);
const serviceName = ref("");
const provider = ref("");
const registry = ref("");
const submitting = ref(false);
const submitMessage = ref("");

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
 * Opens the build dialog.
 *
 * @returns Nothing.
 */
function open(): void {
    submitMessage.value = "";
    dialogRef.value?.showModal();
}

/**
 * Closes the build dialog.
 *
 * @returns Nothing.
 */
function close(): void {
    dialogRef.value?.close();
}

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
    submitMessage.value = "";

    try {
        const result = await store.triggerBuild({
            serviceName: trimmedService,
            provider: provider.value.trim() || undefined,
            registry: registry.value.trim() || undefined
        });

        close();

        if (result.runId) {
            await router.push(`/runs/${result.runId}`);
            return;
        }

        submitMessage.value = t("pages.runs.buildQueued");
        await router.push("/runs?kind=ci_build");
    } finally {
        submitting.value = false;
    }
}

defineExpose({
    open,
    close
});
</script>

<template>
    <dialog ref="dialogRef" class="modal">
        <div class="modal-box max-w-2xl">
            <h3 class="text-lg font-bold">
                {{ t("pages.runs.buildTitle") }}
            </h3>
            <p class="py-2 text-sm text-base-content/70">
                {{ t("pages.runs.buildHint") }}
            </p>

            <div class="space-y-4">
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
                    <RouterLink to="/runs?deploy=open" class="link link-primary mt-2 inline-block" @click="close">
                        {{ t("pages.runs.buildGoDeploy") }}
                    </RouterLink>
                </div>

                <p v-if="!canBuild" class="text-sm text-base-content/70">
                    {{ t("pages.runs.buildNoPermission") }}
                </p>

                <ErrorAlert :error="store.error" />

                <form
                    v-if="canBuild"
                    class="grid gap-4 md:grid-cols-2"
                    @submit.prevent="triggerBuild"
                >
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

                    <p v-if="submitMessage" class="text-sm text-base-content/70 md:col-span-2">
                        {{ submitMessage }}
                    </p>

                    <div class="modal-action mt-0 px-0 md:col-span-2">
                        <button type="button" class="btn" @click="close">
                            {{ t("common.cancel") }}
                        </button>
                        <RouterLink to="/container-registry" class="btn btn-ghost" @click="close">
                            {{ t("pages.runs.buildViewRegistry") }}
                        </RouterLink>
                        <button
                            type="submit"
                            class="btn btn-primary"
                            :class="{ loading: submitting || store.loading }"
                            :disabled="!canSubmit"
                        >
                            {{ t("pages.runs.buildTrigger") }}
                        </button>
                    </div>
                </form>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop">
            <button type="submit">{{ t("common.cancel") }}</button>
        </form>
    </dialog>
</template>
