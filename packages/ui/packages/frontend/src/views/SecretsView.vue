<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight, Folder, KeyRound, Plus } from "@lucide/vue";

import PageLayout from "../components/layout/PageLayout.vue";
import SecretFormModal from "../components/secrets/SecretFormModal.vue";
import SecretRevealModal from "../components/secrets/SecretRevealModal.vue";
import ConfirmModal from "../components/ui/ConfirmModal.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ErrorAlert from "../components/ui/ErrorAlert.vue";
import LoadingSpinner from "../components/ui/LoadingSpinner.vue";
import { useAuthStore } from "../stores/Auth";
import { useClusterStore } from "../stores/Cluster";
import { listSecretBrowserEntries } from "../utils/SecretsBrowser";

const { t } = useI18n();
const store = useClusterStore();
const auth = useAuthStore();
const currentPath = ref<string[]>([]);
const formModalRef = ref<InstanceType<typeof SecretFormModal> | null>(null);
const revealModalRef = ref<InstanceType<typeof SecretRevealModal> | null>(null);
const deleteTarget = ref("");
const deleteModalRef = ref<InstanceType<typeof ConfirmModal> | null>(null);

const browserEntries = computed(() => listSecretBrowserEntries(store.secrets, currentPath.value));

const currentFolderPrefix = computed(() => (
    currentPath.value.length > 0 ? `${currentPath.value.join("/")}/` : ""
));

onMounted(() => {
    void store.refreshSecrets();
});

/**
 * Opens the create secret modal with the active folder prefix.
 *
 * @returns Nothing.
 */
function openCreateModal(): void {
    formModalRef.value?.open(currentFolderPrefix.value);
}

/**
 * Navigates to a virtual folder path.
 *
 * @param path Target folder path segments
 * @returns Nothing.
 */
function navigateTo(path: string[]): void {
    currentPath.value = path;
}

/**
 * Opens a child folder from the current listing.
 *
 * @param path Child folder path segments
 * @returns Nothing.
 */
function openFolder(path: string[]): void {
    navigateTo(path);
}

/**
 * Saves a secret from the form modal.
 *
 * @param payload Secret upsert payload
 * @returns Nothing.
 */
async function saveSecret(payload: {
    name: string;
    data: Record<string, string>;
    description?: string;
}): Promise<void> {
    await store.upsertSecret(payload.name, payload.data, payload.description);
    formModalRef.value?.close();
}

/**
 * Opens the reveal modal for a secret.
 *
 * @param name Secret name
 * @returns Nothing.
 */
function revealSecret(name: string): void {
    void revealModalRef.value?.open(name);
}

/**
 * Opens the delete confirmation modal for a secret.
 *
 * @param name Secret name
 * @returns Nothing.
 */
function requestDeleteSecret(name: string): void {
    deleteTarget.value = name;
    deleteModalRef.value?.open();
}

/**
 * Deletes a cluster secret by name.
 *
 * @returns Nothing.
 */
async function confirmDeleteSecret(): Promise<void> {
    if (!deleteTarget.value) {
        return;
    }

    await store.deleteSecret(deleteTarget.value);
    deleteTarget.value = "";
}
</script>

<template>
    <PageLayout title-key="pages.secrets.title" hint-key="pages.secrets.hint">
        <template v-if="auth.hasPermission('secrets:write')" #actions>
            <button type="button" class="btn btn-primary" @click="openCreateModal">
                <Plus class="size-4" />
                {{ t("pages.secrets.add") }}
            </button>
        </template>

        <ErrorAlert :error="store.error" />

        <div v-if="store.loading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <EmptyState
            v-else-if="!store.error && store.secrets.length === 0"
            title-key="pages.secrets.emptyTitle"
            description-key="pages.secrets.emptyDescription"
            :action-label-key="auth.hasPermission('secrets:write') ? 'pages.secrets.emptyAction' : undefined"
            @action="openCreateModal"
        />

        <div v-else-if="!store.error" class="flex flex-col gap-4">
            <nav class="breadcrumbs text-sm">
                <ul>
                    <li>
                        <button type="button" class="link link-hover" @click="navigateTo([])">
                            {{ t("pages.secrets.rootFolder") }}
                        </button>
                    </li>
                    <li v-for="(segment, index) in currentPath" :key="segment">
                        <button
                            type="button"
                            class="link link-hover"
                            @click="navigateTo(currentPath.slice(0, index + 1))"
                        >
                            {{ segment }}
                        </button>
                    </li>
                </ul>
            </nav>

            <div v-if="browserEntries.length === 0" class="rounded-box border border-dashed border-base-300 px-6 py-10 text-center">
                <p class="text-sm text-base-content/70">
                    {{ t("pages.secrets.emptyFolder") }}
                </p>
            </div>

            <div v-else class="card bg-base-100 shadow">
                <div class="card-body overflow-x-auto p-0 sm:p-6">
                    <table class="table table-zebra">
                        <thead>
                            <tr>
                                <th>{{ t("common.tableColumns.name") }}</th>
                                <th>{{ t("common.tableColumns.scope") }}</th>
                                <th>{{ t("common.actions") }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="entry in browserEntries"
                                :key="entry.type === 'folder' ? `folder:${entry.path.join('/')}` : entry.fullName"
                                :class="entry.type === 'folder' ? 'cursor-pointer hover:bg-base-200/60' : undefined"
                                @click="entry.type === 'folder' ? openFolder(entry.path) : undefined"
                            >
                                <td>
                                    <div class="flex items-center gap-2">
                                        <Folder
                                            v-if="entry.type === 'folder'"
                                            class="size-4 shrink-0 text-primary"
                                        />
                                        <KeyRound
                                            v-else
                                            class="size-4 shrink-0 text-base-content/60"
                                        />
                                        <span
                                            class="font-medium"
                                            :class="entry.type === 'folder' ? 'text-primary' : undefined"
                                            :title="entry.type === 'secret' ? entry.fullName : undefined"
                                        >
                                            {{ entry.name }}
                                        </span>
                                        <ChevronRight
                                            v-if="entry.type === 'folder'"
                                            class="size-4 text-base-content/40"
                                        />
                                    </div>
                                    <p
                                        v-if="entry.type === 'secret' && entry.description"
                                        class="mt-1 pl-6 text-xs text-base-content/60"
                                    >
                                        {{ entry.description }}
                                    </p>
                                </td>
                                <td>
                                    <span v-if="entry.type === 'secret'">{{ entry.scope }}</span>
                                    <span v-else class="text-base-content/40">-</span>
                                </td>
                                <td @click.stop>
                                    <div v-if="entry.type === 'secret'" class="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            class="btn btn-outline btn-sm"
                                            @click="revealSecret(entry.fullName)"
                                        >
                                            {{ t("pages.secrets.reveal") }}
                                        </button>
                                        <button
                                            v-if="auth.hasPermission('secrets:write')"
                                            type="button"
                                            class="btn btn-error btn-outline btn-sm"
                                            @click="requestDeleteSecret(entry.fullName)"
                                        >
                                            {{ t("pages.secrets.delete") }}
                                        </button>
                                    </div>
                                    <button
                                        v-else
                                        type="button"
                                        class="btn btn-ghost btn-sm"
                                        @click="openFolder(entry.path)"
                                    >
                                        {{ t("pages.secrets.openFolder") }}
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <SecretFormModal ref="formModalRef" @save="saveSecret" />
        <SecretRevealModal ref="revealModalRef" />

        <ConfirmModal
            ref="deleteModalRef"
            title-key="pages.secrets.delete"
            confirm-label-key="common.delete"
            danger
            @confirm="confirmDeleteSecret"
        >
            <p v-if="deleteTarget" class="py-4">
                {{ deleteTarget }}
            </p>
        </ConfirmModal>
    </PageLayout>
</template>
