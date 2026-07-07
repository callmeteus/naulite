<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";

import { useAuthStore } from "../stores/Auth";

const { t } = useI18n();
const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const email = ref("");
const password = ref("");

/**
 * Submits the login form and redirects to the requested route.
 *
 * @returns Nothing.
 */
async function submitLogin(): Promise<void> {
    const trimmedEmail = email.value.trim();

    if (!trimmedEmail || !password.value) {
        return;
    }

    await auth.login(trimmedEmail, password.value);

    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/nodes";
    await router.replace(redirect);
}
</script>

<template>
    <section class="flex min-h-screen items-center justify-center bg-base-200 p-4">
        <div class="w-full max-w-md space-y-6">
            <header class="text-center">
                <p class="text-3xl font-bold">Naulite</p>
                <p class="mt-1 text-sm text-base-content/70">{{ t("pages.login.tagline") }}</p>
            </header>

            <div class="card bg-base-100 shadow-xl">
                <div class="card-body">
                    <h2 class="card-title">{{ t("pages.login.title") }}</h2>
                    <p class="text-sm text-base-content/70">{{ t("pages.login.hint") }}</p>

                    <div v-if="auth.error" role="alert" class="alert alert-error mt-2">
                        <span>{{ auth.error }}</span>
                    </div>

                    <form class="mt-4 flex flex-col gap-4" @submit.prevent="submitLogin">
                        <label class="form-control w-full">
                            <span class="label-text">{{ t("pages.login.email") }}</span>
                            <input
                                v-model="email"
                                type="email"
                                class="input input-bordered w-full"
                                autocomplete="username"
                                :placeholder="t('pages.login.emailPlaceholder')"
                                :disabled="auth.loading"
                            />
                        </label>
                        <label class="form-control w-full">
                            <span class="label-text">{{ t("pages.login.password") }}</span>
                            <input
                                v-model="password"
                                type="password"
                                class="input input-bordered w-full"
                                autocomplete="current-password"
                                :placeholder="t('pages.login.passwordPlaceholder')"
                                :disabled="auth.loading"
                            />
                        </label>
                        <button
                            type="submit"
                            class="btn btn-primary w-full"
                            :disabled="auth.loading || !email.trim() || !password"
                        >
                            {{ auth.loading ? t("pages.login.submitting") : t("pages.login.submit") }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </section>
</template>
