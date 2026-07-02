/**
 * Declarative registry entry loaded from configuration.
 */
export interface RegistryConfigEntry {
    id: string;
    name: string;
    url: string;
    isDefault?: boolean;
    credentialsSecret?: {
        secretName: string;
        key?: string;
    };
}

/**
 * Options for the declarative multi-registry provider.
 */
export interface DeclarativeRegistryProviderOptions {
    registries: RegistryConfigEntry[];
}
