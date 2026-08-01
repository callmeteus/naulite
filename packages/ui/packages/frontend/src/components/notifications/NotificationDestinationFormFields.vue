<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { PipelineEventKind } from "@naulite/sdk";

const { t } = useI18n();

const name = defineModel<string>("name", { required: true });
const type = defineModel<"SLACK" | "WEBHOOK">("type", { required: true });
const url = defineModel<string>("url", { required: true });
const secret = defineModel<string>("secret", { required: true });
const enabled = defineModel<boolean>("enabled", { required: true });
const allowedKinds = defineModel<PipelineEventKind[]>("allowedKinds", { required: true });

defineProps<{
    eventKindOptions: PipelineEventKind[];
}>();

/**
 * Toggles a pipeline event kind in the destination filter selection.
 *
 * @param kind Pipeline event kind
 * @returns Nothing.
 */
function toggleEventKind(kind: PipelineEventKind): void {
    const next = allowedKinds.value.includes(kind)
        ? allowedKinds.value.filter((entry) => entry !== kind)
        : [...allowedKinds.value, kind];

    allowedKinds.value = next;
}

/**
 * Selects every pipeline event kind for the destination form.
 *
 * @param eventKindOptions Available event kinds
 * @returns Nothing.
 */
function selectAllEventKinds(eventKindOptions: PipelineEventKind[]): void {
    allowedKinds.value = [...eventKindOptions];
}

/**
 * Clears every pipeline event kind for the destination form.
 *
 * @returns Nothing.
 */
function clearEventKinds(): void {
    allowedKinds.value = [];
}
</script>

<style scoped>
.filter-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.25rem 0.75rem;
}

.filter-option {
    display: flex;
    gap: 0.35rem;
    align-items: center;
    font-size: 0.85rem;
}
</style>

<template>
    <div class="grid gap-6">
        <div class="grid gap-4 md:grid-cols-2">
            <label class="form-control md:col-span-2">
                <span class="label-text">{{ t("pages.notifications.name") }}</span>
                <input
                    v-model="name"
                    type="text"
                    class="input input-bordered w-full"
                    required
                />
            </label>

            <label class="form-control w-full">
                <span class="label-text">{{ t("pages.notifications.type") }}</span>
                <select v-model="type" class="select select-bordered w-full">
                    <option value="SLACK">{{ t("pages.notifications.typeSlack") }}</option>
                    <option value="WEBHOOK">{{ t("pages.notifications.typeWebhook") }}</option>
                </select>
            </label>

            <label class="form-control w-full">
                <span class="label-text">{{ t("pages.notifications.enabled") }}</span>
                <input v-model="enabled" type="checkbox" class="toggle toggle-primary mt-2" />
            </label>

            <label class="form-control md:col-span-2">
                <span class="label-text">{{ t("pages.notifications.webhookUrl") }}</span>
                <input
                    v-model="url"
                    type="url"
                    class="input input-bordered w-full"
                    :placeholder="t('pages.notifications.webhookUrlPlaceholder')"
                    required
                />
            </label>

            <label v-if="type === 'WEBHOOK'" class="form-control md:col-span-2">
                <span class="label-text">{{ t("pages.notifications.webhookSecret") }}</span>
                <input
                    v-model="secret"
                    type="password"
                    class="input input-bordered w-full"
                    :placeholder="t('pages.notifications.webhookSecretPlaceholder')"
                />
            </label>
        </div>

        <div>
            <div class="flex flex-wrap items-center justify-between gap-2">
                <h4 class="font-medium">
                    {{ t("pages.notifications.filters") }}
                </h4>
                <div class="flex gap-2">
                    <button type="button" class="btn btn-ghost btn-xs" @click="selectAllEventKinds(eventKindOptions)">
                        {{ t("pages.notifications.selectAllEvents") }}
                    </button>
                    <button type="button" class="btn btn-ghost btn-xs" @click="clearEventKinds">
                        {{ t("pages.notifications.clearEvents") }}
                    </button>
                </div>
            </div>
            <p class="mt-1 text-sm text-base-content/60">
                {{ t("pages.notifications.filtersHint") }}
            </p>
            <div class="filter-grid mt-3">
                <label
                    v-for="kind in eventKindOptions"
                    :key="kind"
                    class="filter-option"
                >
                    <input
                        type="checkbox"
                        class="checkbox checkbox-sm"
                        :checked="allowedKinds.includes(kind)"
                        @change="toggleEventKind(kind)"
                    />
                    <span>{{ kind }}</span>
                </label>
            </div>
        </div>
    </div>
</template>
