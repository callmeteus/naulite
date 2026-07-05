<script setup lang="ts">
import { useRouter } from "vue-router";

import { t } from "./ui/Translate";
import { useAuthStore } from "./stores/Auth";

const auth = useAuthStore();
const router = useRouter();

/**
 * Signs out the current operator and redirects to the login screen.
 *
 * @returns Nothing.
 */
async function logout(): Promise<void> {
    await auth.logout();
    await router.push("/login");
}
</script>

<template>
    <div v-if="!auth.checked && auth.loading" class="boot-loading">
        <p>{{ t("loading") }}</p>
    </div>
    <div v-else-if="$route.meta.public" class="public-layout">
        <router-view />
    </div>
    <div v-else class="layout">
        <aside class="sidebar">
            <h1>{{ t("dashboard") }}</h1>
            <p v-if="auth.user" class="sidebar-user">{{ auth.user.email }} ({{ auth.user.role }})</p>
            <nav>
                <router-link v-if="auth.hasPermission('nodes:read')" to="/nodes">{{ t("nodes") }}</router-link>
                <router-link v-if="auth.hasPermission('workloads:read')" to="/services">{{ t("services") }}</router-link>
                <router-link v-if="auth.hasPermission('workloads:read')" to="/instances">{{ t("instances") }}</router-link>
                <router-link v-if="auth.hasPermission('workloads:read')" to="/volumes">{{ t("volumes") }}</router-link>
                <router-link v-if="auth.hasPermission('secrets:read')" to="/secrets">{{ t("secrets") }}</router-link>
                <router-link v-if="auth.hasPermission('metrics:read')" to="/cluster">{{ t("cluster") }}</router-link>
                <router-link v-if="auth.hasPermission('metrics:read')" to="/metrics">{{ t("metrics") }}</router-link>
                <router-link v-if="auth.hasPermission('gitops:read')" to="/gitops">{{ t("gitops") }}</router-link>
                <router-link v-if="auth.hasPermission('manifests:apply')" to="/deploy">{{ t("deploy") }}</router-link>
                <router-link v-if="auth.hasPermission('runs:write')" to="/build">{{ t("build") }}</router-link>
                <router-link v-if="auth.hasPermission('nodes:provision')" to="/provision">{{ t("provision") }}</router-link>
                <router-link v-if="auth.hasPermission('runs:read')" to="/runs">{{ t("runs") }}</router-link>
                <router-link v-if="auth.hasPermission('registry:read')" to="/gateway-routes">{{ t("gatewayRoutes") }}</router-link>
                <router-link v-if="auth.hasPermission('registry:read')" to="/container-registry">{{ t("containerRegistry") }}</router-link>
                <router-link v-if="auth.hasPermission('backups:read')" to="/backups">{{ t("backups") }}</router-link>
                <router-link v-if="auth.hasPermission('netbird:read')" to="/netbird">{{ t("netbird") }}</router-link>
                <router-link v-if="auth.hasPermission('notifications:read')" to="/notifications">{{ t("notifications") }}</router-link>
                <router-link v-if="auth.hasPermission('admin:api-keys:read')" to="/api-keys">{{ t("apiKeys") }}</router-link>
                <router-link v-if="auth.hasPermission('admin:users:read')" to="/admin-users">{{ t("adminUsers") }}</router-link>
            </nav>
            <button type="button" class="logout-button" @click="logout">{{ t("logout") }}</button>
        </aside>
        <main class="content">
            <router-view />
        </main>
    </div>
</template>
