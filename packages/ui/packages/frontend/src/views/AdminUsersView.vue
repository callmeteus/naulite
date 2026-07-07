<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { AdminRole, AdminUser } from "@naulite/sdk";
import { nauliteClient } from "../api/Client";
import PageLayout from "../components/layout/PageLayout.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import StatusPill from "../components/ui/StatusPill.vue";

const { t } = useI18n();
const users = ref<AdminUser[]>([]);
const loading = ref(false);
const error = ref("");
const message = ref("");
const createModalRef = ref<HTMLDialogElement | null>(null);
const editModalRef = ref<HTMLDialogElement | null>(null);
const disableModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);
const createEmail = ref("");
const createPassword = ref("");
const createRole = ref<AdminRole>("viewer");
const editUser = ref<AdminUser | null>(null);
const editRole = ref<AdminRole>("viewer");
const editPassword = ref("");
const disableTarget = ref<AdminUser | null>(null);

onMounted(() => {
    void refreshUsers();
});

/**
 * Reloads the admin user list from the BFF.
 *
 * @returns Nothing.
 */
async function refreshUsers(): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        users.value = await nauliteClient.listAdminUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Opens the create user modal.
 *
 * @returns Nothing.
 */
function openCreateModal(): void {
    createEmail.value = "";
    createPassword.value = "";
    createRole.value = "viewer";
    createModalRef.value?.showModal();
}

/**
 * Closes the create user modal.
 *
 * @returns Nothing.
 */
function closeCreateModal(): void {
    createModalRef.value?.close();
}

/**
 * Creates a new admin user account.
 *
 * @returns Nothing.
 */
async function createUser(): Promise<void> {
    const trimmedEmail = createEmail.value.trim();

    if (!trimmedEmail || createPassword.value.length < 8) {
        return;
    }

    loading.value = true;
    error.value = "";
    message.value = "";

    try {
        await nauliteClient.createAdminUser({
            email: trimmedEmail,
            password: createPassword.value,
            role: createRole.value
        });
        closeCreateModal();
        message.value = t("pages.adminUsers.created");
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Opens the edit user modal.
 *
 * @param user Admin user to edit
 * @returns Nothing.
 */
function openEditModal(user: AdminUser): void {
    editUser.value = user;
    editRole.value = user.role;
    editPassword.value = "";
    editModalRef.value?.showModal();
}

/**
 * Closes the edit user modal.
 *
 * @returns Nothing.
 */
function closeEditModal(): void {
    editModalRef.value?.close();
    editUser.value = null;
}

/**
 * Saves user edits through the admin users API.
 *
 * @returns Nothing.
 */
async function saveEditUser(): Promise<void> {
    if (!editUser.value) {
        return;
    }

    loading.value = true;
    error.value = "";
    message.value = "";

    try {
        await nauliteClient.updateAdminUser(editUser.value.id, {
            role: editRole.value,
            password: editPassword.value.length >= 8 ? editPassword.value : undefined
        });
        message.value = t("pages.adminUsers.updated");
        closeEditModal();
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Re-enables a disabled admin user.
 *
 * @param user Admin user to enable
 * @returns Nothing.
 */
async function enableUser(user: AdminUser): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        await nauliteClient.enableAdminUser(user.id);
        message.value = t("pages.adminUsers.enabled");
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Opens the disable confirmation modal.
 *
 * @param user Admin user to disable
 * @returns Nothing.
 */
function requestDisableUser(user: AdminUser): void {
    disableTarget.value = user;
    disableModalRef.value?.open();
}

/**
 * Disables an admin user by identifier.
 *
 * @returns Nothing.
 */
async function confirmDisableUser(): Promise<void> {
    if (!disableTarget.value) {
        return;
    }

    loading.value = true;
    error.value = "";

    try {
        await nauliteClient.disableAdminUser(disableTarget.value.id);
        message.value = t("pages.adminUsers.disabled");
        disableTarget.value = null;
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <PageLayout title-key="pages.adminUsers.title" hint-key="pages.adminUsers.hint">
        <template #actions>
            <button type="button" class="btn btn-primary btn-sm" @click="openCreateModal">
                {{ t("pages.adminUsers.create") }}
            </button>
        </template>

        <ErrorAlert :error="error" />

        <p v-if="message" class="alert alert-success">{{ message }}</p>

        <div v-if="loading && users.length === 0" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!error && users.length === 0"
            title-key="pages.adminUsers.emptyTitle"
            description-key="pages.adminUsers.emptyDescription"
            action-label-key="pages.adminUsers.emptyAction"
            @action="openCreateModal"
        />

        <div v-else class="card bg-base-100 shadow">
            <div class="card-body overflow-x-auto p-0 sm:p-6">
                <table class="table table-zebra">
                    <thead>
                        <tr>
                            <th>{{ t("common.tableColumns.email") }}</th>
                            <th>{{ t("common.tableColumns.role") }}</th>
                            <th>{{ t("common.tableColumns.createdAt") }}</th>
                            <th>{{ t("pages.adminUsers.status") }}</th>
                            <th>{{ t("common.actions") }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="user in users" :key="user.id">
                            <td>{{ user.email }}</td>
                            <td><span class="badge badge-outline">{{ user.role }}</span></td>
                            <td>{{ user.createdAt }}</td>
                            <td>
                                <StatusPill :status="user.disabledAt ? 'disabled' : 'active'" />
                            </td>
                            <td class="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    :disabled="loading || Boolean(user.disabledAt)"
                                    @click="openEditModal(user)"
                                >
                                    {{ t("pages.adminUsers.edit") }}
                                </button>
                                <button
                                    v-if="user.disabledAt"
                                    type="button"
                                    class="btn btn-outline btn-sm"
                                    :disabled="loading"
                                    @click="enableUser(user)"
                                >
                                    {{ t("pages.adminUsers.enable") }}
                                </button>
                                <button
                                    v-if="!user.disabledAt"
                                    type="button"
                                    class="btn btn-error btn-outline btn-sm"
                                    :disabled="loading"
                                    @click="requestDisableUser(user)"
                                >
                                    {{ t("pages.adminUsers.disable") }}
                                </button>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <dialog ref="createModalRef" class="modal">
            <div class="modal-box">
                <h3 class="text-lg font-bold">{{ t("pages.adminUsers.create") }}</h3>
                <form class="mt-4 grid gap-4" @submit.prevent="createUser">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.login.email") }}</span>
                        <input v-model="createEmail" type="email" class="input input-bordered w-full" />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.login.password") }}</span>
                        <input
                            v-model="createPassword"
                            type="password"
                            minlength="8"
                            class="input input-bordered w-full"
                        />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.adminUsers.role") }}</span>
                        <select v-model="createRole" class="select select-bordered w-full">
                            <option value="viewer">viewer</option>
                            <option value="operator">operator</option>
                            <option value="admin">admin</option>
                        </select>
                    </label>
                    <div class="modal-action mt-2 px-0">
                        <button type="button" class="btn" @click="closeCreateModal">{{ t("common.cancel") }}</button>
                        <button
                            type="submit"
                            class="btn btn-primary"
                            :disabled="loading || !createEmail.trim() || createPassword.length < 8"
                        >
                            {{ t("pages.adminUsers.createButton") }}
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="button" @click="closeCreateModal">close</button>
            </form>
        </dialog>

        <dialog ref="editModalRef" class="modal">
            <div class="modal-box">
                <h3 class="text-lg font-bold">{{ t("pages.adminUsers.editTitle") }}</h3>
                <form v-if="editUser" class="mt-4 grid gap-4" @submit.prevent="saveEditUser">
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.login.email") }}</span>
                        <input :value="editUser.email" type="email" class="input input-bordered w-full" disabled />
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.adminUsers.role") }}</span>
                        <select v-model="editRole" class="select select-bordered w-full">
                            <option value="viewer">viewer</option>
                            <option value="operator">operator</option>
                            <option value="admin">admin</option>
                        </select>
                    </label>
                    <label class="form-control w-full">
                        <span class="label-text">{{ t("pages.adminUsers.resetPassword") }}</span>
                        <input v-model="editPassword" type="password" class="input input-bordered w-full" />
                    </label>
                    <div class="modal-action mt-2 px-0">
                        <button type="button" class="btn" @click="closeEditModal">{{ t("common.cancel") }}</button>
                        <button type="submit" class="btn btn-primary" :disabled="loading">
                            {{ t("common.save") }}
                        </button>
                    </div>
                </form>
            </div>
            <form method="dialog" class="modal-backdrop">
                <button type="button" @click="closeEditModal">close</button>
            </form>
        </dialog>

        <ConfirmModal
            ref="disableModalRef"
            title-key="pages.adminUsers.disableTitle"
            message-key="pages.adminUsers.disableConfirm"
            confirm-label-key="pages.adminUsers.disable"
            danger
            @confirm="confirmDisableUser"
        />
    </PageLayout>
</template>
