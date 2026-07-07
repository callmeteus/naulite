<script setup lang="ts">
import { useRouter } from "vue-router";

import PageLayout from "../components/layout/PageLayout.vue";

const router = useRouter();
</script>

<template>
    <PageLayout title-key="pages.forbidden.title" hint-key="pages.forbidden.message">
        <div class="card bg-base-100 shadow">
            <div class="card-body items-center text-center">
                <h2 class="card-title text-error">403</h2>
                <button type="button" class="btn btn-primary" @click="router.push('/nodes')">
                    {{ $t("pages.forbidden.back") }}
                </button>
            </div>
        </div>
    </PageLayout>
</template>
