import type { RegistryCredentials, RegistryProvider } from "@platform/shared";
import type { Registry, ResolvedSecret } from "@platform/shared";

import type { DeclarativeRegistryProviderOptions, RegistryConfigEntry } from "./RegistryConfig.js";

/**
 * Credential resolver used to hydrate registry pull secrets.
 */
export interface RegistryCredentialResolver {
    /**
     * Resolves a secret referenced by registry configuration.
     * 
     * @param secretName Secret name to resolve
     * @returns Resolved secret payload when available
     */
    resolveSecret(secretName: string): Promise<ResolvedSecret | undefined>;
}

/**
 * Options used when constructing a declarative registry provider with secret resolution.
 */
export interface DeclarativeRegistryProviderFactoryOptions extends DeclarativeRegistryProviderOptions {
    credentialResolver?: RegistryCredentialResolver;
}

/**
 * Multi-registry provider backed by declarative configuration entries.
 */
export class DeclarativeRegistryProvider implements RegistryProvider {
    private readonly registries: Registry[];
    private readonly credentialResolver?: RegistryCredentialResolver;

    /**
     * Creates a declarative registry provider from configuration entries.
     * 
     * @param options Declarative registry configuration and optional credential resolver
     */
    constructor(options: DeclarativeRegistryProviderFactoryOptions) {
        const now = new Date().toISOString();
        this.registries = options.registries.map((entry) => this.toRegistry(entry, now));
        this.credentialResolver = options.credentialResolver;
    }

    /**
     * Lists configured registries known to the control plane.
     * 
     * @returns Registry metadata entries
     */
    async list(): Promise<Registry[]> {
        console.debug("[registries] list count=%d", this.registries.length);
        return [...this.registries];
    }

    /**
     * Resolves credentials for a registry identifier.
     * 
     * @param registryId Registry identifier
     * @returns Resolved credentials when available
     */
    async resolveCredentials(registryId: string): Promise<RegistryCredentials | undefined> {
        const registry = this.registries.find((entry) => entry.id === registryId);
        if (!registry?.credentialsSecret || !this.credentialResolver) {
            console.debug("[registries] resolveCredentials registryId=%s credentials=missing", registryId);
            return undefined;
        }

        const secret = await this.credentialResolver.resolveSecret(registry.credentialsSecret.secretName);
        if (!secret) {
            return undefined;
        }

        const username = secret.data.username ?? secret.data["registry-username"];
        const password = secret.data.password ?? secret.data["registry-password"] ?? secret.data.token;
        if (!username || !password) {
            console.debug("[registries] resolveCredentials registryId=%s keys=invalid", registryId);
            return undefined;
        }

        console.debug("[registries] resolveCredentials registryId=%s", registryId);
        return {
            username,
            password,
            email: secret.data.email
        };
    }

    /**
     * Builds a runtime pull secret payload for an agent.
     * 
     * @param registryId Registry identifier
     * @returns Resolved secret payload for the agent runtime
     */
    async buildPullSecret(registryId: string): Promise<ResolvedSecret | undefined> {
        const credentials = await this.resolveCredentials(registryId);
        if (!credentials) {
            return undefined;
        }

        console.debug("[registries] buildPullSecret registryId=%s", registryId);
        return {
            name: `registry-${registryId}`,
            data: {
                username: credentials.username,
                password: credentials.password,
                ...(credentials.email ? { email: credentials.email } : {})
            }
        };
    }

    /**
     * Converts a configuration entry into registry metadata.
     * 
     * @param entry Declarative registry configuration entry
     * @param timestamp ISO timestamp used for created and updated fields
     * @returns Registry metadata
     */
    private toRegistry(entry: RegistryConfigEntry, timestamp: string): Registry {
        return {
            id: entry.id,
            name: entry.name,
            url: entry.url,
            isDefault: entry.isDefault ?? false,
            credentialsSecret: entry.credentialsSecret,
            createdAt: timestamp,
            updatedAt: timestamp
        };
    }
}

/**
 * Creates a declarative multi-registry provider.
 * 
 * @param options Declarative registry configuration and optional credential resolver
 * @returns Configured registry provider
 */
export function createDeclarativeRegistryProvider(
    options: DeclarativeRegistryProviderFactoryOptions
): DeclarativeRegistryProvider {
    return new DeclarativeRegistryProvider(options);
}
