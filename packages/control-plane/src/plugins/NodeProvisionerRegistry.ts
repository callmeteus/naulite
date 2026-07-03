import type { NodeProvisionerProvider } from "@platform/shared";

/**
 * Registry for node provisioner plugins discovered at runtime.
 */
export class NodeProvisionerRegistry {
    private readonly providers = new Map<string, NodeProvisionerProvider>();

    /**
     * Registers a node provisioner provider.
     *
     * @param provider Provider instance to register
     * @returns Nothing.
     */
    register(provider: NodeProvisionerProvider): void {
        this.providers.set(provider.id, provider);
    }

    /**
     * Returns a registered provider by id.
     *
     * @param id Registered provider id
     * @returns Provider when found
     */
    get(id: string): NodeProvisionerProvider | undefined {
        return this.providers.get(id);
    }

    /**
     * Requires a registered provider by id.
     *
     * @param id Registered provider id
     * @returns Provider instance
     */
    require(id: string): NodeProvisionerProvider {
        const provider = this.get(id);

        if (!provider) {
            throw new Error(`Node provisioner provider not found: ${id}`);
        }

        return provider;
    }

    /**
     * Lists registered provider ids.
     *
     * @returns Sorted provider ids
     */
    listIds(): string[] {
        return [...this.providers.keys()].sort();
    }
}
