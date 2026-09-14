<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { TargetGroup } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";

const { t } = useI18n();
const auth = useAuthStore();
const store = useClusterStore();

const groups = ref<TargetGroup[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const saving = ref(false);

const createModalRef = ref<HTMLDialogElement | null>(null);
const editModalRef = ref<HTMLDialogElement | null>(null);
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const draftId = ref("");
const draftName = ref("");
const draftMemberIds = ref<string[]>([]);
const editingGroup = ref<TargetGroup | null>(null);
const pendingDeleteId = ref<string | null>(null);

const canWrite = computed(() => auth.hasPermission("nodes:write"));

const nodeOptions = computed(() =>
    store.nodes.map((node) => ({
        id: node.id,
        label: node.hostname || node.id
    }))
);

/**
 * Loads target groups from the control plane.
 *
 * @returns Nothing.
 */
async function refresh(): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
        await store.refreshOverview({ silent: true });
        const response = await nauliteClient.listTargetGroups({ limit: 100 });
        groups.value = response.items;
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Resets the create form fields.
 *
 * @returns Nothing.
 */
function resetCreateForm(): void {
    draftId.value = "";
    draftName.value = "";
    draftMemberIds.value = [];
}

/**
 * Opens the create target group modal.
 *
 * @returns Nothing.
 */
function openCreateModal(): void {
    resetCreateForm();
    createModalRef.value?.showModal();
}

/**
 * Closes the create target group modal.
 *
 * @returns Nothing.
 */
function closeCreateModal(): void {
    createModalRef.value?.close();
}

/**
 * Opens the edit modal for a target group.
 *
 * @param group Target group row
 * @returns Nothing.
 */
function openEditModal(group: TargetGroup): void {
    editingGroup.value = group;
    draftName.value = group.name;
    draftMemberIds.value = [...group.memberNodeIds];
    editModalRef.value?.showModal();
}

/**
 * Closes the edit target group modal.
 *
 * @returns Nothing.
 */
function closeEditModal(): void {
    editModalRef.value?.close();
    editingGroup.value = null;
}

/**
 * Toggles a node id in the draft membership list.
 *
 * @param nodeId Node identifier
 * @returns Nothing.
 */
function toggleMember(nodeId: string): void {
    if (draftMemberIds.value.includes(nodeId)) {
        draftMemberIds.value = draftMemberIds.value.filter((id) => id !== nodeId);
        return;
    }

    draftMemberIds.value = [...draftMemberIds.value, nodeId];
}

/**
 * Creates a new target group.
 *
 * @returns Nothing.
 */
async function createGroup(): Promise<void> {
    const id = draftId.value.trim();
    const name = draftName.value.trim();

    if (!id || !name) {
        return;
    }

    saving.value = true;
    error.value = null;

    try {
        await nauliteClient.createTargetGroup({
            id,
            name,
            memberNodeIds: draftMemberIds.value
        });
        closeCreateModal();
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

/**
 * Saves edits for the selected target group.
 *
 * @returns Nothing.
 */
async function saveGroup(): Promise<void> {
    if (!editingGroup.value) {
        return;
    }

    const name = draftName.value.trim();

    if (!name) {
        return;
    }

    saving.value = true;
    error.value = null;

    try {
        await nauliteClient.updateTargetGroup(editingGroup.value.id, {
            name,
            memberNodeIds: draftMemberIds.value
        });
        closeEditModal();
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

/**
 * Opens delete confirmation for a target group.
 *
 * @param groupId Target group id
 * @returns Nothing.
 */
function requestDelete(groupId: string): void {
    pendingDeleteId.value = groupId;
    deleteModalRef.value?.open();
}

/**
 * Deletes the pending target group.
 *
 * @returns Nothing.
 */
async function confirmDelete(): Promise<void> {
    if (!pendingDeleteId.value) {
        return;
    }

    saving.value = true;
    error.value = null;

    try {
        await nauliteClient.deleteTargetGroup(pendingDeleteId.value);
        pendingDeleteId.value = null;
        await refresh();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        saving.value = false;
    }
}

/**
 * Formats member node ids for table display.
 *
 * @param memberNodeIds Node ids in the group
 * @returns Comma-separated hostnames or ids
 */
function formatMembers(memberNodeIds: string[]): string {
    if (memberNodeIds.length === 0) {
        return "-";
    }

    const nodesById = new Map(store.nodes.map((node) => [node.id, node.hostname || node.id]));

    return memberNodeIds.map((id) => nodesById.get(id) ?? id).join(", ");
}

onMounted(() => {
    void refresh();
});
</script>

<template>
    <PageLayout title-key="pages.groups.title" hint-key="pages.groups.hint">
        <template #actions>
            <button
                v-if="canWrite"
                type="button"
                class="btn btn-primary btn-sm"
                @click="openCreateModal"
            >
                {{ t("pages.groups.create") }}
            </button>
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
            v-else-if="groups.length === 0"
            title-key="pages.groups.emptyTitle"
            description-key="pages.groups.emptyDescription"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body gap-3 p-4 sm:p-6">
                <div class="overflow-x-auto">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.id") }}</th>
                                <th>{{ t("common.tableColumns.name") }}</th>
                                <th>{{ t("pages.groups.members") }}</th>
                                <th v-if="canWrite">{{ t("common.actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="group in groups" :key="group.id">
                                <td class="font-mono text-sm">{{ group.id }}</td>
                                <td>{{ group.name }}</td>
                                <td class="text-sm text-base-content/80">
                                    {{ formatMembers(group.memberNodeIds) }}
                                </td>
                                <td v-if="canWrite">
                                    <div class="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            class="btn btn-ghost btn-xs"
                                            @click="openEditModal(group)"
                                        >
                                            {{ t("common.edit") }}
                                        </button>
                                        <button
                                            type="button"
                                            class="btn btn-ghost btn-xs text-error"
                                            @click="requestDelete(group.id)"
                                        >
                                            {{ t("common.delete") }}
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <dialog ref="createModalRef" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="text-lg font-bold">{{ t("pages.groups.createTitle") }}</h3>
                <div class="mt-4 flex flex-col gap-3">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.groups.id") }}</span>
                        <input
                            v-model="draftId"
                            type="text"
                            class="input input-bordered w-full"
                            :placeholder="t('pages.groups.idPlaceholder')"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("common.tableColumns.name") }}</span>
                        <input
                            v-model="draftName"
                            type="text"
                            class="input input-bordered w-full"
                        />
                    </label>
                    <div>
                        <p class="label-text mb-2">{{ t("pages.groups.members") }}</p>
                        <div class="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-base-300 p-3">
                            <label
                                v-for="node in nodeOptions"
                                :key="node.id"
                                class="flex cursor-pointer items-center gap-2 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm"
                                    :checked="draftMemberIds.includes(node.id)"
                                    @change="toggleMember(node.id)"
                                />
                                <span>{{ node.label }}</span>
                            </label>
                            <p v-if="nodeOptions.length === 0" class="text-sm text-base-content/70">
                                {{ t("pages.groups.noNodes") }}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn" @click="closeCreateModal">
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :class="{ loading: saving }"
                        :disabled="saving"
                        @click="createGroup"
                    >
                        {{ t("common.create") }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit">{{ t("common.dismiss") }}</button>
            </form>
        </dialog>

        <dialog ref="editModalRef" class="modal">
            <div class="modal-box max-w-lg">
                <h3 class="text-lg font-bold">{{ t("pages.groups.editTitle") }}</h3>
                <div class="mt-4 flex flex-col gap-3">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("common.tableColumns.name") }}</span>
                        <input
                            v-model="draftName"
                            type="text"
                            class="input input-bordered w-full"
                        />
                    </label>
                    <div>
                        <p class="label-text mb-2">{{ t("pages.groups.members") }}</p>
                        <div class="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-lg border border-base-300 p-3">
                            <label
                                v-for="node in nodeOptions"
                                :key="node.id"
                                class="flex cursor-pointer items-center gap-2 text-sm"
                            >
                                <input
                                    type="checkbox"
                                    class="checkbox checkbox-sm"
                                    :checked="draftMemberIds.includes(node.id)"
                                    @change="toggleMember(node.id)"
                                />
                                <span>{{ node.label }}</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="modal-action">
                    <button type="button" class="btn" @click="closeEditModal">
                        {{ t("common.cancel") }}
                    </button>
                    <button
                        type="button"
                        class="btn btn-primary"
                        :class="{ loading: saving }"
                        :disabled="saving"
                        @click="saveGroup"
                    >
                        {{ t("common.save") }}
                    </button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="submit">{{ t("common.dismiss") }}</button>
            </form>
        </dialog>

        <ConfirmModal
            ref="deleteModalRef"
            title-key="pages.groups.deleteTitle"
            message-key="pages.groups.deleteConfirm"
            confirm-label-key="common.delete"
            @confirm="confirmDelete"
        />
    </PageLayout>
</template>
