import type { Registry } from "../types/Registry.js";
import type { ResolvedSecret } from "../types/Common.js";

/**
 * Credentials resolved for a registry pull or push operation.
 */
export interface RegistryCredentials {
    username: string;
    password: string;
    email?: string;
}

/**
 * Registry provider contract for credential resolution and pull secret generation.
 */
export interface RegistryProvider {
    /**
     * Lists configured registries known to the control plane.
     * 
     * @returns Registry metadata entries
     */
    list(): Promise<Registry[]>;

    /**
     * Resolves credentials for a registry identifier.
     * 
     * @param registryId Registry identifier
     * @returns Resolved credentials when available
     */
    resolveCredentials(registryId: string): Promise<RegistryCredentials | undefined>;

    /**
     * Builds a runtime pull secret payload for an agent.
     * 
     * @param registryId Registry identifier
     * @returns Resolved secret payload for the agent runtime
     */
    buildPullSecret(registryId: string): Promise<ResolvedSecret | undefined>;
}
