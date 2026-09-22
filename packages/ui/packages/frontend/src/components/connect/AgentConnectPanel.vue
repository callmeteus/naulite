<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";

import type { NetBirdEnrollment, Node } from "@naulite/sdk";
import CopyableCodeBlock from "../ui/CopyableCodeBlock.vue";
import ErrorAlert from "../ui/ErrorAlert.vue";
import LoadingSpinner from "../ui/LoadingSpinner.vue";
import PlatformTerminalTabs from "../ui/PlatformTerminalTabs.vue";
import type { TerminalPlatform } from "../ui/TerminalPlatform";
import { nauliteClient } from "../../api/Client";
import { parseApiError, type ParsedApiError } from "../../composables/useApiAction";
import { buildInfrastructureInstallCommand } from "../../utils/netbirdConnectPresentation";
import { isNetBirdDeviceOnline } from "../../utils/netbirdPresentation";

enum ConnectionCheckState {
    IDLE = "idle",
    CHECKING = "checking",
    CONNECTED = "connected",
    WAITING = "waiting"
}

const { t } = useI18n();

const enrollmentLoading = ref(false);
const enrollmentError = ref<ParsedApiError | null>(null);
const enrollment = ref<NetBirdEnrollment | null>(null);
const terminalPlatform = ref<TerminalPlatform>("unix");
const checkState = ref<ConnectionCheckState>(ConnectionCheckState.IDLE);
const checkMessageKey = ref<string | null>(null);
const lastOnlineNodeCount = ref(0);
const lastOnlineDeviceCount = ref(0);

const installCommand = computed(() => {
    if (!enrollment.value) {
        return "";
    }

    return buildInfrastructureInstallCommand(enrollment.value, terminalPlatform.value);
});

onMounted(() => {
    void loadEnrollment();
});

/**
 * Loads NetBird enrollment details for install instructions.
 *
 * @returns Nothing.
 */
async function loadEnrollment(): Promise<void> {
    enrollmentLoading.value = true;
    enrollmentError.value = null;

    try {
        enrollment.value = await nauliteClient.getNetBirdEnrollment();
    } catch (err) {
        enrollment.value = null;
        enrollmentError.value = parseApiError(err);
    } finally {
        enrollmentLoading.value = false;
    }
}

/**
 * Polls cluster nodes and mesh devices to confirm a host enrolled.
 *
 * @returns Nothing.
 */
async function checkConnection(): Promise<void> {
    checkState.value = ConnectionCheckState.CHECKING;
    checkMessageKey.value = null;

    try {
        const [nodeList, deviceList] = await Promise.all([
            nauliteClient.listNodes(),
            nauliteClient.listNetBirdDevices()
        ]);

        const onlineNodes = nodeList.filter((node: Node) => node.status === "online");
        const onlineDevices = deviceList.filter((device) => isNetBirdDeviceOnline(device));

        lastOnlineNodeCount.value = onlineNodes.length;
        lastOnlineDeviceCount.value = onlineDevices.length;

        if (onlineNodes.length > 0) {
            checkState.value = ConnectionCheckState.CONNECTED;
            checkMessageKey.value = "pages.connect.checkSuccessNodes";
            return;
        }

        if (onlineDevices.length > 0) {
            checkState.value = ConnectionCheckState.CONNECTED;
            checkMessageKey.value = "pages.connect.checkSuccessDevices";
            return;
        }

        if (nodeList.length > 0) {
            checkState.value = ConnectionCheckState.WAITING;
            checkMessageKey.value = "pages.connect.checkRegisteredOffline";
            return;
        }

        checkState.value = ConnectionCheckState.WAITING;
        checkMessageKey.value = "pages.connect.checkNoneYet";
    } catch (err) {
        checkState.value = ConnectionCheckState.WAITING;
        checkMessageKey.value = null;
        enrollmentError.value = parseApiError(err);
    }
}
</script>

<template>
    <div class="flex flex-col gap-4">
        <ErrorAlert :error="enrollmentError" />

        <div v-if="enrollmentLoading" class="flex items-center gap-2">
            <LoadingSpinner />
            <span>{{ t("common.loading") }}</span>
        </div>

        <template v-else-if="!enrollmentError">
            <PlatformTerminalTabs v-model="terminalPlatform" />

            <CopyableCodeBlock
                :code="installCommand"
                label-key="pages.connect.installOneLiner"
                empty-key="pages.netbird.connectEnrollmentUnavailable"
            />

            <div class="rounded-lg border border-base-300 bg-base-200/40 p-4">
                <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p class="font-medium">{{ t("pages.connect.checkTitle") }}</p>
                        <p class="mt-1 text-sm text-base-content/70">
                            {{ t("pages.connect.checkHint") }}
                        </p>
                    </div>
                    <button
                        type="button"
                        class="btn btn-primary btn-sm"
                        :class="{ loading: checkState === ConnectionCheckState.CHECKING }"
                        :disabled="checkState === ConnectionCheckState.CHECKING"
                        @click="checkConnection"
                    >
                        {{ t("pages.connect.checkAction") }}
                    </button>
                </div>

                <div
                    v-if="checkMessageKey"
                    class="alert mt-3 text-sm"
                    :class="
                        checkState === ConnectionCheckState.CONNECTED
                            ? 'border-success/30 bg-success/10'
                            : 'border-warning/30 bg-warning/10'
                    "
                >
                    <span>{{
                        t(checkMessageKey, {
                            nodes: lastOnlineNodeCount,
                            devices: lastOnlineDeviceCount
                        })
                    }}</span>
                </div>
            </div>
        </template>
    </div>
</template>
