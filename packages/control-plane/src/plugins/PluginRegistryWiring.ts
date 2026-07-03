import type { PluginRegistry } from "@platform/shared";

import type { NodeProvisionerProvider } from "@platform/shared";

import type { ControlPlaneContext } from "../ControlPlaneContext";
import { BackupDestinationProvider } from "../modules/backup/BackupDestinationProvider";
import { ContainerRegistryBlobProvider } from "../modules/container-registry/ContainerRegistryBlobProvider";
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
        }
    }

    /**
     * Returns loaded plugins filtered by registration type.
     *
     * @param registry Plugin registry
     * @param type Plugin registration type
     * @returns Matching plugin registrations
     */
    export function listByType(
        registry: PluginRegistry,
        type: LoadedPluginRegistration["type"]
    ): LoadedPluginRegistration[] {
        return registry.list()
            .map((entry) => entry.plugin as LoadedPluginRegistration)
            .filter((plugin) => plugin.type === type);
    }
}
