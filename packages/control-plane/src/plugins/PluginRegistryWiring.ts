import type { NotificationProvider, NodeProvisionerProvider, SecretProvider } from "@naulite/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";
import { BackupDestinationProvider } from "../modules/backup/BackupDestinationProvider";
import { ContainerRegistryBlobProvider } from "../modules/container-registry/ContainerRegistryBlobProvider";
import {
    PluginSecretProviderAdapter,
    resolveSecretBackendId
} from "../modules/secrets/PluginSecretProviderAdapter";
import { RunNotificationDispatcher } from "../services/RunNotificationDispatcher";
import type { LoadedPluginRegistration } from "./LoadedPluginRegistration";
import { Logger } from "../Logger";
const log_plugins = Logger.create("plugins");
const log_secrets = Logger.create("secrets");


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
                log_plugins.debug("wired backup destination id=%s", plugin.id);
            }

            if (plugin.containerRegistryBlobProvider) {
                context.containerRegistryService.register(
                    plugin.containerRegistryBlobProvider as ContainerRegistryBlobProvider
                );
                log_plugins.debug("wired container registry blob id=%s", plugin.id);
            }

            if (plugin.type === "nodeProvisioner" && plugin.nodeProvisionerProvider) {
                context.nodeProvisionerRegistry.register(
                    plugin.nodeProvisionerProvider as NodeProvisionerProvider
                );
                log_plugins.debug("wired node provisioner id=%s", plugin.id);
            }

            if (plugin.type === "notification" && plugin.notificationProvider) {
                RunNotificationDispatcher.register(
                    plugin.id,
                    plugin.notificationProvider as NotificationProvider
                );
                log_plugins.debug("wired notification provider id=%s", plugin.id);
            }

            if (plugin.type === "secret" && plugin.secretProvider) {
                context.secretProviderRegistry.register(
                    plugin.id,
                    plugin.secretProvider as SecretProvider
                );
                log_plugins.debug("wired secret provider id=%s", plugin.id);
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
        log_secrets.debug("backend=%s available=%o", backendId, context.secretProviderRegistry.listIds());

        if (backendId === "local" || backendId === "postgres") {
            return;
        }

        const pluginProvider = context.secretProviderRegistry.get(backendId);

        if (!pluginProvider) {
            log_secrets.debug("backend=%s not registered, keeping default provider", backendId);
            return;
        }

        context.secretProvider = new PluginSecretProviderAdapter(pluginProvider);
        log_secrets.debug("active provider id=%s", backendId);
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
