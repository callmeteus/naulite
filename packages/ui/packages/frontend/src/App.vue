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
                <router-link to="/deploy">{{ t("deploy") }}</router-link>
                <router-link to="/backups">{{ t("backups") }}</router-link>
                <router-link to="/api-keys">{{ t("apiKeys") }}</router-link>
            </nav>
        </aside>
        <main class="content">
            <router-view />
        </main>
    </div>
</template>
