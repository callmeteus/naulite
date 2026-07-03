<script setup lang="ts">
import { onMounted, ref } from "vue";

import type { AdminRole, AdminUser } from "@platform/sdk";
import { platformClient } from "../api/Client";
import { t } from "../ui/Translate";

const users = ref<AdminUser[]>([]);
const loading = ref(false);
const error = ref("");
const email = ref("");
const password = ref("");
const role = ref<AdminRole>("viewer");
const message = ref("");

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
        users.value = await platformClient.listAdminUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Creates a new admin user account.
 *
 * @returns Nothing.
 */
async function createUser(): Promise<void> {
    const trimmedEmail = email.value.trim();

    if (!trimmedEmail || password.value.length < 8) {
        return;
    }

    loading.value = true;
    error.value = "";
    message.value = "";

    try {
        await platformClient.createAdminUser({
            email: trimmedEmail,
            password: password.value,
            role: role.value
        });
        email.value = "";
        password.value = "";
        role.value = "viewer";
        message.value = t("adminUsersCreated");
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}

/**
 * Disables an admin user by identifier.
 *
 * @param userId Admin user identifier
 * @returns Nothing.
 */
async function disableUser(userId: string): Promise<void> {
    loading.value = true;
    error.value = "";

    try {
        await platformClient.disableAdminUser(userId);
        await refreshUsers();
    } catch (err) {
        error.value = err instanceof Error ? err.message : String(err);
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <section>
        <h2>{{ t("adminUsers") }}</h2>
        <p class="hint">{{ t("adminUsersHint") }}</p>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-if="message" class="hint">{{ message }}</p>

        <div class="panel">
            <h3>{{ t("adminUsersCreate") }}</h3>
            <form class="create-form" @submit.prevent="createUser">
                <label>
                    {{ t("loginEmail") }}
                    <input v-model="email" type="email" />
                </label>
                <label>
                    {{ t("loginPassword") }}
                    <input v-model="password" type="password" minlength="8" />
                </label>
                <label>
                    {{ t("adminUsersRole") }}
                    <select v-model="role">
                        <option value="viewer">viewer</option>
                        <option value="operator">operator</option>
                        <option value="admin">admin</option>
                    </select>
                </label>
                <button type="submit" :disabled="loading || !email.trim() || password.length < 8">
                    {{ t("adminUsersCreateButton") }}
                </button>
            </form>
        </div>

        <div class="panel">
            <h3>{{ t("adminUsersList") }}</h3>
            <p v-if="loading">{{ t("loading") }}</p>
            <table v-else>
                <thead>
                    <tr>
                        <th>{{ t("loginEmail") }}</th>
                        <th>{{ t("adminUsersRole") }}</th>
                        <th>{{ t("adminUsersCreatedAt") }}</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="user in users" :key="user.id">
                        <td>{{ user.email }}</td>
                        <td>{{ user.role }}</td>
                        <td>{{ user.createdAt }}</td>
                        <td>
                            <button
                                v-if="!user.disabledAt"
                                type="button"
                                :disabled="loading"
                                @click="disableUser(user.id)"
                            >
                                {{ t("adminUsersDisable") }}
                            </button>
                            <span v-else class="hint">{{ t("adminUsersDisabled") }}</span>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </section>
</template>
