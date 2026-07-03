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
        <div class="panel login-panel">
            <h2>{{ t("loginTitle") }}</h2>
            <p class="hint">{{ t("loginHint") }}</p>
            <p v-if="auth.error" class="error">{{ auth.error }}</p>

            <form class="create-form" @submit.prevent="submitLogin">
                <label>
                    {{ t("loginEmail") }}
                    <input v-model="email" type="email" autocomplete="username" />
                </label>
                <label>
                    {{ t("loginPassword") }}
                    <input v-model="password" type="password" autocomplete="current-password" />
                </label>
                <button type="submit" :disabled="auth.loading || !email.trim() || !password">
                    {{ t("loginSubmit") }}
                </button>
            </form>
        </div>
    </section>
</template>
