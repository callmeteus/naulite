<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Moon, Sun } from "@lucide/vue";

import { navigationSections } from "../../config/navigation";
import { useLocale, type AppLocale } from "../../composables/useLocale";
import { useTheme } from "../../composables/useTheme";
import { useAuthStore } from "../../stores/Auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const { theme, toggleTheme } = useTheme();
const { locale, setLocale } = useLocale();

const visibleSections = computed(() =>
    navigationSections
        .map((section) => ({
            ...section,
            items: section.items.filter((item) => auth.hasPermission(item.permission))
        }))
        .filter((section) => section.items.length > 0)
);

/**
 * Signs out the current operator and redirects to login.
 *
 * @returns Nothing.
 */
async function logout(): Promise<void> {
    await auth.logout();
    await router.push("/login");
}

/**
 * Switches the UI locale.
 *
 * @param value Locale identifier
 * @returns Nothing.
 */
function changeLocale(value: AppLocale): void {
    setLocale(value);
}
</script>

<template>
    <aside class="flex h-full min-h-screen w-64 flex-col border-r border-base-300 bg-base-200">
        <div class="border-b border-base-300 p-4">
            <h1 class="text-lg font-bold">{{ t("menu.dashboard") }}</h1>
            <p v-if="auth.user" class="mt-1 break-all text-xs text-base-content/70">
                {{ auth.user.email }} ({{ auth.user.role }})
            </p>
        </div>

        <nav class="flex-1 overflow-y-auto px-3 py-4">
            <div v-for="section in visibleSections" :key="section.id" class="mb-5">
                <p class="menu-title mb-2 px-3 text-xs uppercase tracking-wide opacity-70">
                    {{ t(section.labelKey) }}
                </p>
                <ul class="flex w-full flex-col gap-1">
                    <li v-for="item in section.items" :key="item.path" class="w-full">
                        <router-link
                            :to="item.path"
                            class="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
                            :class="
                                route.path === item.path
                                    ? 'bg-primary text-primary-content shadow-sm'
                                    : 'text-base-content/80 hover:bg-base-100 hover:text-base-content'
                            "
                        >
                            <component :is="item.icon" class="size-5 shrink-0" />
                            <span class="truncate">{{ t(item.labelKey) }}</span>
                        </router-link>
                    </li>
                </ul>
            </div>
        </nav>

        <div class="space-y-3 border-t border-base-300 p-4">
            <div class="flex items-center gap-2">
                <button
                    type="button"
                    class="btn btn-ghost btn-sm flex-1"
                    :title="theme === 'light' ? t('menu.themeDark') : t('menu.themeLight')"
                    @click="toggleTheme"
                >
                    <Sun v-if="theme === 'dark'" class="size-4" />
                    <Moon v-else class="size-4" />
                </button>
                <select
                    class="select select-bordered select-sm flex-1"
                    :value="locale"
                    @change="changeLocale(($event.target as HTMLSelectElement).value as AppLocale)"
                >
                    <option value="en">{{ t("menu.localeEn") }}</option>
                    <option value="pt-BR">{{ t("menu.localePtBr") }}</option>
                </select>
            </div>
            <button type="button" class="btn btn-outline btn-sm w-full" @click="logout">
                {{ t("menu.logout") }}
            </button>
        </div>
    </aside>
</template>
