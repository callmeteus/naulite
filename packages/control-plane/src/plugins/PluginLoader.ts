import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PluginRegistry, type PluginRegistration } from "@platform/shared";

/**
 * Plugin loader that auto-discovers packages under packages/plugins/.
 */
export class PluginLoader {
    /**
     * Creates a plugin loader.
     *
     * @param packagesDir Directory containing platform packages
     */
    constructor(private readonly packagesDir: string) {}

    /**
     * Discovers and registers plugins from packages/plugins/* directories.
     *
     * @param registry Plugin registry to populate
     * @returns Loaded plugin registry
     */
    async load(registry: PluginRegistry = new PluginRegistry()): Promise<PluginRegistry> {
        const pluginsDir = join(this.packagesDir, "plugins");

        if (!existsSync(pluginsDir)) {
            return registry;
        }

        const directories = readdirSync(pluginsDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();

        for (const directoryName of directories) {
            const pluginEntry = join(pluginsDir, directoryName, "dist", "index.js");

            try {
                const module = await import(pathToFileURL(pluginEntry).href) as {
                    default?: PluginRegistration;
                    plugin?: PluginRegistration;
                };
                const plugin = module.default ?? module.plugin;

                if (plugin) {
                    registry.register(directoryName, plugin);
                }
            } catch {
                continue;
            }
        }

        return registry;
    }
}
