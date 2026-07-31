<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRouter } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import RelationSelect from "../components/ui/RelationSelect.vue";
import {
    NodeProvisionProvider,
    NodeProvisionProviderRelation
} from "../domain/NodeProvisionProvider";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const router = useRouter();
const store = useClusterStore();

const provider = ref<NodeProvisionProvider>(NodeProvisionProvider.AWS);
const instanceType = ref("t3.small");
const amiId = ref("");
const region = ref("");
const count = ref(1);

const canSubmit = computed(() =>
    amiId.value.trim().length > 0
    && instanceType.value.trim().length > 0
    && count.value >= 1
    && count.value <= 10
);

/**
 * Submits the provision request and opens the status page.
 *
 * @returns Nothing.
 */
async function submitProvision(): Promise<void> {
    if (!canSubmit.value) {
        return;
    }

    const provision = await store.provisionNode({
        provider: provider.value,
        instanceType: instanceType.value.trim(),
        amiId: amiId.value.trim(),
        count: count.value,
        region: region.value.trim() || undefined
    });

    await router.push(`/provision/${provision.id}`);
}
</script>

<template>
    <PageLayout title-key="pages.provision.newTitle" hint-key="pages.provision.newHint">
        <template #actions>
            <RouterLink to="/provision" class="btn btn-ghost btn-sm">
                {{ t("pages.provision.backToList") }}
            </RouterLink>
        </template>

        <ErrorAlert :error="store.error" />

        <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
            <div class="alert border border-info/20 bg-info/10 text-sm">
                <span>{{ t("pages.provision.newIntro") }}</span>
            </div>

            <form class="flex flex-col gap-6" @submit.prevent="submitProvision">
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
                    <RouterLink to="/provision" class="btn btn-ghost">
                        {{ t("common.cancel") }}
                    </RouterLink>
                    <button
                        type="submit"
                        class="btn btn-primary"
                        :class="{ loading: store.loading }"
                        :disabled="store.loading || !canSubmit"
                    >
                        {{ t("pages.provision.submit") }}
                    </button>
                </div>
            </form>
        </div>
    </PageLayout>
</template>
