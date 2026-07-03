import type { NotificationProvider, NodeProvisionerProvider, SecretProvider } from "@platform/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";
import { BackupDestinationProvider } from "../modules/backup/BackupDestinationProvider";
import { ContainerRegistryBlobProvider } from "../modules/container-registry/ContainerRegistryBlobProvider";
import {
    PluginSecretProviderAdapter,
    resolveSecretBackendId
} from "../modules/secrets/PluginSecretProviderAdapter";
import { RunNotificationDispatcher } from "../services/RunNotificationDispatcher";
import type { LoadedPluginRegistration } from "./LoadedPluginRegistration";

/**
 * Wires discovered plugin providers into the control plane application context.
 */
export namespace PluginRegistryWiring {
    /**
     * Registers plugin capabilities from the plugin registry into runtime services.
     *
     * @param context Control plane application context
     * @returns Nothing.
     */
    export function wire(context: ControlPlaneContext): void {
        for (const entry of context.pluginRegistry.list()) {
            const plugin = entry.plugin as LoadedPluginRegistration;

            if (plugin.type === "backupDestination" && plugin.backupDestinationProvider) {
                context.backupOrchestrator.register(
                    plugin.backupDestinationProvider as BackupDestinationProvider
                );
                console.debug("[plugins] wired backup destination id=%s", plugin.id);
            }

            if (plugin.containerRegistryBlobProvider) {
                context.containerRegistryService.register(
                    plugin.containerRegistryBlobProvider as ContainerRegistryBlobProvider
                );
                console.debug("[plugins] wired container registry blob id=%s", plugin.id);
            }

            if (plugin.type === "nodeProvisioner" && plugin.nodeProvisionerProvider) {
                context.nodeProvisionerRegistry.register(
                    plugin.nodeProvisionerProvider as NodeProvisionerProvider
                );
                console.debug("[plugins] wired node provisioner id=%s", plugin.id);
            }

            if (plugin.type === "notification" && plugin.notificationProvider) {
                RunNotificationDispatcher.register(
                    plugin.notificationProvider as NotificationProvider
                );
                console.debug("[plugins] wired notification provider id=%s", plugin.id);
            }

            if (plugin.type === "secret" && plugin.secretProvider) {
                context.secretProviderRegistry.register(
                    plugin.id,
                    plugin.secretProvider as SecretProvider
                );
                console.debug("[plugins] wired secret provider id=%s", plugin.id);
            }
        }

        wireSecretProvider(context);
    }

    /**
     * Selects the active secret provider based on environment configuration.
     *
     * @param context Control plane application context
     * @returns Nothing.
     */
    export function wireSecretProvider(context: ControlPlaneContext): void {
        if (!context.secretProviderRegistry) {
            return;
        }

        const backendId = resolveSecretBackendId();
        console.debug("[secrets] backend=%s available=%o", backendId, context.secretProviderRegistry.listIds());

        if (backendId === "local") {
            return;
        }

        const pluginProvider = context.secretProviderRegistry.get(backendId);

        if (!pluginProvider) {
            console.debug("[secrets] backend=%s not registered, keeping local provider", backendId);
            return;
        }

        context.secretProvider = new PluginSecretProviderAdapter(pluginProvider);
        console.debug("[secrets] active provider id=%s", backendId);
    }

    /**
     * Returns loaded plugins filtered by registration type.
     *
     * @param registry Plugin registry
     * @param type Plugin registration type
     * @returns Matching plugin registrations
     */
    export function listByType(
        registry: ControlPlaneContext["pluginRegistry"],
        type: LoadedPluginRegistration["type"]
    ): LoadedPluginRegistration[] {
        return registry.list()
            .map((entry) => entry.plugin as LoadedPluginRegistration)
            .filter((plugin) => plugin.type === type);
    }
}
