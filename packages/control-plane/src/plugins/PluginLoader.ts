import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { PluginRegistry, type PluginRegistration } from "@naulite/shared";

import type { LoadedPluginModule } from "./LoadedPluginRegistration";

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
                const module = await import(pathToFileURL(pluginEntry).href) as LoadedPluginModule;
                const plugin = module.default ?? module.plugin;

                if (plugin) {
                    registry.register(directoryName, plugin as PluginRegistration);
                    console.debug("[plugins] loaded id=%s type=%s dir=%s", plugin.id, plugin.type, directoryName);
                }
            } catch (err) {
                console.debug("[plugins] skipped dir=%s error=%o", directoryName, err);
                continue;
            }
        }

        return registry;
    }
}
