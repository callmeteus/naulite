import type { RuntimeProvider } from "@platform/shared";

/**
 * Registry for container runtime providers available to the control plane.
 */
export class RuntimeRegistry {
    private readonly providers = new Map<string, RuntimeProvider>();

    /**
     * Registers a runtime provider.
     *
     * @param id Runtime identifier such as docker or podman
     * @param provider Runtime provider instance
     * @returns Nothing.
     */
    register(id: string, provider: RuntimeProvider): void {
        this.providers.set(id, provider);
    }

    /**
     * Returns a registered runtime provider by id.
     *
     * @param id Runtime identifier
     * @returns Provider when found
     */
    get(id: string): RuntimeProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Requires a registered runtime provider by id.
     *
     * @param id Runtime identifier
     * @returns Provider instance
     */
    require(id: string): RuntimeProvider {
        const provider = this.get(id);

        if (!provider) {
            throw new Error(`Runtime provider not found: ${id}`);
        }

        return provider;
    }

    /**
     * Lists registered runtime provider ids.
     *
     * @returns Sorted runtime ids
     */
    listIds(): string[] {
        return [...this.providers.keys()].sort();
    }
}
