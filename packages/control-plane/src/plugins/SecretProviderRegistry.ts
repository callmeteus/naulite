import type { SecretProvider as SharedSecretProvider } from "@naulite/shared";

/**
 * Registry for secret provider plugins discovered at runtime.
 */
export class SecretProviderRegistry {
    private readonly providers = new Map<string, SharedSecretProvider>();

    /**
     * Registers a secret provider plugin.
     *
     * @param id Provider identifier
     * @param provider Secret provider instance
     * @returns Nothing.
     */
    register(id: string, provider: SharedSecretProvider): void {
        this.providers.set(id, provider);
    }

    /**
     * Returns a registered secret provider by id.
     *
     * @param id Provider identifier
     * @returns Provider when found
     */
    get(id: string): SharedSecretProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Requires a registered secret provider by id.
     *
     * @param id Provider identifier
     * @returns Provider instance
     */
    require(id: string): SharedSecretProvider {
        const provider = this.get(id);

        if (!provider) {
            throw new Error(`Secret provider not found: ${id}`);
        }

        return provider;
    }

    /**
     * Lists registered secret provider ids.
     *
     * @returns Sorted provider ids
     */
    listIds(): string[] {
        return [...this.providers.keys()].sort();
    }
}
