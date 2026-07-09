<script setup lang="ts">
import { ref } from "vue";
import { Menu } from "@lucide/vue";

import Sidebar from "./Sidebar.vue";

const drawerOpen = ref(false);
</script>

<template>
    <div class="drawer lg:drawer-open">
        <input
            id="app-drawer"
            v-model="drawerOpen"
            type="checkbox"
            class="drawer-toggle"
        />
        <div class="drawer-content flex min-h-screen flex-col">
            <div class="navbar bg-base-100 shadow-sm lg:hidden">
                <label for="app-drawer" class="btn btn-ghost btn-square" aria-label="Menu">
                    <Menu class="size-5" />
                </label>
                <span class="text-lg font-semibold">{{ $t("menu.dashboard") }}</span>
            </div>
            <main class="flex-1 p-4 lg:p-8">
                <slot />
            </main>
        </div>
        <div class="drawer-side z-40">
            <label for="app-drawer" class="drawer-overlay" aria-label="Close menu" />
            <Sidebar />
        </div>
    </div>
</template>
