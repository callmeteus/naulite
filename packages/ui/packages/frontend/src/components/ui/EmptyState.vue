<script setup lang="ts">
import type { Component } from "vue";
import { Inbox } from "@lucide/vue";

defineProps<{
    titleKey: string;
    descriptionKey: string;
    actionLabelKey?: string;
    actionTo?: string;
    icon?: Component;
}>();

const emit = defineEmits<{
    action: [];
}>();
</script>

<template>
    <div class="flex flex-col items-center justify-center gap-4 rounded-box border border-dashed border-base-300 bg-base-200/40 px-6 py-12 text-center">
        <component :is="icon ?? Inbox" class="size-12 text-base-content/40" />
        <div>
            <h3 class="text-lg font-semibold">{{ $t(titleKey) }}</h3>
            <p class="mt-1 text-sm text-base-content/70">{{ $t(descriptionKey) }}</p>
        </div>
        <router-link v-if="actionLabelKey && actionTo" :to="actionTo" class="btn btn-primary btn-sm">
            {{ $t(actionLabelKey) }}
        </router-link>
        <button
            v-else-if="actionLabelKey"
            type="button"
            class="btn btn-primary btn-sm"
            @click="emit('action')"
        >
            {{ $t(actionLabelKey) }}
        </button>
    </div>
</template>
