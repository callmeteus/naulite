<script setup lang="ts">
import { t } from "./ui/Translate";
</script>

<template>
    <div class="layout">
        <aside class="sidebar">
            <h1>{{ t("dashboard") }}</h1>
            <nav>
                <router-link to="/nodes">{{ t("nodes") }}</router-link>
                <router-link to="/services">{{ t("services") }}</router-link>
                <router-link to="/instances">{{ t("instances") }}</router-link>
                <router-link to="/volumes">{{ t("volumes") }}</router-link>
                <router-link to="/secrets">{{ t("secrets") }}</router-link>
                <router-link to="/cluster">{{ t("cluster") }}</router-link>
                <router-link to="/gitops">{{ t("gitops") }}</router-link>
                <router-link to="/deploy">{{ t("deploy") }}</router-link>
                <router-link to="/build">{{ t("build") }}</router-link>
                <router-link to="/provision">{{ t("provision") }}</router-link>
                <router-link to="/runs">{{ t("runs") }}</router-link>
                <router-link to="/gateway-routes">{{ t("gatewayRoutes") }}</router-link>
                <router-link to="/container-registry">{{ t("containerRegistry") }}</router-link>
                <router-link to="/backups">{{ t("backups") }}</router-link>
                <router-link to="/netbird">{{ t("netbird") }}</router-link>
                <router-link to="/api-keys">{{ t("apiKeys") }}</router-link>
            </nav>
        </aside>
        <main class="content">
            <router-view />
        </main>
    </div>
</template>
