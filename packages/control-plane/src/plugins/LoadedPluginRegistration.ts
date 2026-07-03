import type { PluginRegistration } from "@platform/shared";

/**
 * Plugin package export contract discovered by the control plane loader.
 */
export interface LoadedPluginModule {
    default?: LoadedPluginRegistration;
    plugin?: LoadedPluginRegistration;
}

/**
 * Plugin registration enriched with optional provider instances.
 */
export interface LoadedPluginRegistration extends PluginRegistration {
    backupDestinationProvider?: {
        id: string;
        write: (task: unknown, archivePath: string) => Promise<unknown>;
        delete: (location: string) => Promise<void>;
        validate: (task: unknown) => Promise<boolean>;
    };
    containerRegistryBlobProvider?: {
        id: string;
        writeStream: (input: unknown) => Promise<{ location: string }>;
        getStream: (location: string) => Promise<unknown>;
        head: (location: string) => Promise<unknown>;
        delete: (location: string) => Promise<void>;
        validate: (destination: unknown, resolvedSecrets: Record<string, string>) => Promise<boolean>;
    };
    secretProvider?: {
        list: () => Promise<unknown>;
        upsert: (input: unknown) => Promise<unknown>;
        delete: (name: string) => Promise<void>;
        resolve: (name: string) => Promise<unknown>;
        resolveForAgent: (filter: unknown) => Promise<unknown>;
    };
    nodeProvisionerProvider?: {
        id: string;
        provision: (spec: unknown) => Promise<unknown>;
        getStatus: (cloudInstanceId: string, region?: string) => Promise<unknown>;
        terminate: (cloudInstanceId: string, region?: string) => Promise<void>;
    };
}
