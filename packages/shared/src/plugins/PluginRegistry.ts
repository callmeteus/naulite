import type { PluginRegistration } from "../types/Plugin";

/**
 * Entry stored in the plugin registry.
 */
export interface PluginRegistryEntry<T> {
    id: string;
    plugin: T;
    directoryName?: string;
}

/**
 * In-memory registry for platform plugins discovered from packages/plugins/*.
 */
export class PluginRegistry<T extends PluginRegistration = PluginRegistration> {
    private readonly entries = new Map<string, PluginRegistryEntry<T>>();

    /**
     * Registers a plugin, stripping a leading plugin- prefix from directory names.
     * 
     * @param directoryOrId Plugin directory name or registered id
     * @param plugin Plugin instance to register
     * @returns Nothing.
     */
    register(directoryOrId: string, plugin: T): void {
        const id = PluginRegistry.normalizeId(directoryOrId);
        this.entries.set(id, {
            id,
            plugin,
            directoryName: directoryOrId.startsWith("plugin-") ? directoryOrId : undefined
        });
    }

    /**
     * Returns a registered plugin by id.
     * 
     * @param id Registered plugin id without the plugin- prefix
     * @returns Registry entry when found
     */
    get(id: string): PluginRegistryEntry<T> | undefined {
        return this.entries.get(PluginRegistry.normalizeId(id));
    }

    /**
     * Lists all registered plugins sorted by id.
     * 
     * @returns Registered plugin entries
     */
    list(): PluginRegistryEntry<T>[] {
        return [...this.entries.values()].sort((left, right) => left.id.localeCompare(right.id));
    }

    /**
     * Normalizes a plugin directory name into a registry id.
     * 
     * @param directoryOrId Plugin directory name or registered id
     * @returns Registry id without the plugin- prefix
     */
    static normalizeId(directoryOrId: string): string {
        return directoryOrId.startsWith("plugin-")
            ? directoryOrId.slice("plugin-".length)
            : directoryOrId;
    }
}
