<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { SandboxTemplate } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const auth = useAuthStore();

const templates = ref<SandboxTemplate[]>([]);
const idleWarmByTemplateId = ref<Record<string, number>>({});
const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);
const editModalRef = ref<HTMLDialogElement | null>(null);
const editingTemplate = ref<SandboxTemplate | null>(null);
const draftWarmPool = ref(0);
const draftBakeCron = ref("");

const canWrite = computed(() => auth.hasPermission("nodes:write"));

/**
 * Loads sandbox templates from the control plane.
 *
 * @returns Nothing.
 */
async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
        const response = await nauliteClient.listSandboxTemplates({ limit: 100 });
        templates.value = response.items;
        await loadPoolStats();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Loads warm pool idle counts for each template row.
 *
 * @returns Nothing.
 */
async function loadPoolStats(): Promise<void> {
    const counts: Record<string, number> = {};

    for (const template of templates.value) {
        try {
            const detail = await nauliteClient.getSandboxTemplate(template.id);
            const idle = detail.instances.filter((row) => {
                return row.kind === "warm" && row.status === "idle";
            }).length;
            counts[template.id] = idle;
        } catch {
            counts[template.id] = 0;
        }
    }

    idleWarmByTemplateId.value = counts;
}

/**
 * Opens the edit modal for a template.
 *
 * @param template Sandbox template row
 * @returns Nothing.
 */
function openEditModal(template: SandboxTemplate): void {
    editingTemplate.value = template;
    draftWarmPool.value = template.warmPoolSize;
    draftBakeCron.value = template.bakeCron ?? "";
    editModalRef.value?.showModal();
}

/**
 * Persists warm pool and bake cron for the selected template.
 *
 * @returns Nothing.
 */
async function saveTemplate(): Promise<void> {
    if (!editingTemplate.value) {
        return;
    }

    saving.value = true;
    error.value = null;

    try {
        await nauliteClient.updateSandboxTemplate(editingTemplate.value.id, {
            warmPoolSize: draftWarmPool.value,
            bakeCron: draftBakeCron.value.trim() === "" ? null : draftBakeCron.value.trim()
        });
        editModalRef.value?.close();
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

/**
 * Triggers a manual bake for the template.
 *
 * @param template Sandbox template row
 * @returns Nothing.
 */
async function triggerBake(template: SandboxTemplate): Promise<void> {
    saving.value = true;
    error.value = null;

    try {
        await nauliteClient.triggerSandboxBake(template.id);
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

onMounted(() => {
    void refresh();
});
</script>

<template>
    <PageLayout title-key="pages.sandboxes.title" hint-key="pages.sandboxes.hint">
        <template #actions>
            <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="loading"
                @click="refresh"
            >
                {{ t("common.refresh") }}
            </button>
        </template>

        <ErrorAlert :error="error" />

        <div v-if="loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="templates.length === 0"
            title-key="pages.sandboxes.emptyTitle"
            description-key="pages.sandboxes.emptyDescription"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body gap-3 p-4 sm:p-6">
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("pages.sandboxes.node") }}</th>
                                <th>{{ t("pages.sandboxes.lastBake") }}</th>
                                <th>{{ t("pages.sandboxes.warmPool") }}</th>
                                <th>{{ t("pages.sandboxes.poolIdle") }}</th>
                                <th>{{ t("pages.sandboxes.bakeCron") }}</th>
                                <th v-if="canWrite">{{ t("common.actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="template in templates" :key="template.id">
                                <td class="font-mono text-sm">{{ template.id }}</td>
                                <td>{{ template.nodeId }}</td>
                                <td>{{ template.bakedAt ?? "-" }}</td>
                                <td>{{ template.warmPoolSize }}</td>
                                <td>{{ idleWarmByTemplateId[template.id] ?? 0 }}</td>
                                <td>{{ template.bakeCron ?? "-" }}</td>
                                <td v-if="canWrite">
                                    <div class="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            class="btn btn-ghost btn-xs"
                                            @click="openEditModal(template)"
                                        >
                                            {{ t("common.edit") }}
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-primary btn-xs"
                                            :disabled="saving"
                                            @click="triggerBake(template)"
                                        >
                                            {{ t("pages.sandboxes.bake") }}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <dialog ref="editModalRef" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="text-lg font-bold">{{ t("pages.sandboxes.editTitle") }}</h3>
                <div class="mt-4 flex flex-col gap-3">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.sandboxes.warmPool") }}</span>
                        <input
                            v-model.number="draftWarmPool"
                            type="number"
                            min="0"
                            class="input input-bordered w-full"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.sandboxes.bakeCron") }}</span>
                        <input
                            v-model="draftBakeCron"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.sandboxes.bakeCronPlaceholder')"
                        />
                    </label>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn" @click="editModalRef?.close()">
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :disabled="saving"
                        @click="saveTemplate"
                    >
                        {{ t("common.save") }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit">{{ t("common.close") }}</button>
            </form>
        </dialog>
    </PageLayout>
</template>
