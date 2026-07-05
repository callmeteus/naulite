<script setup lang="ts">
import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";

import { t } from "../ui/Translate";
import { useAuthStore } from "../stores/Auth";

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
    <section class="login-page">
        <div class="login-shell">
            <header class="login-brand">
                <p class="login-logo">Naulite</p>
                <p class="login-tagline">{{ t("loginTagline") }}</p>
            </header>

            <div class="panel login-panel">
                <h2>{{ t("loginTitle") }}</h2>
                <p class="login-hint">{{ t("loginHint") }}</p>

                <div v-if="auth.error" class="login-error" role="alert">
                    {{ auth.error }}
                </div>

                <form class="login-form" @submit.prevent="submitLogin">
                    <label>
                        <span>{{ t("loginEmail") }}</span>
                        <input
                            v-model="email"
                            type="email"
                            autocomplete="username"
                            :placeholder="t('loginEmailPlaceholder')"
                            :disabled="auth.loading"
                        />
                    </label>
                    <label>
                        <span>{{ t("loginPassword") }}</span>
                        <input
                            v-model="password"
                            type="password"
                            autocomplete="current-password"
                            :placeholder="t('loginPasswordPlaceholder')"
                            :disabled="auth.loading"
                        />
                    </label>
                    <button type="submit" :disabled="auth.loading || !email.trim() || !password">
                        {{ auth.loading ? t("loginSubmitting") : t("loginSubmit") }}
                    </button>
                </form>
            </div>
        </div>
    </section>
</template>
