import type { Secret } from "../types/Secret";
import type { ResolvedSecret } from "../types/Common";

/**
 * Input for creating or updating a cluster secret.
 */
export interface SecretUpsertInput {
    name: string;
    data: Record<string, string>;
    scope?: "cluster" | "service";
    serviceName?: string;
    description?: string;
}

/**
 * Filter describing which secret keys may be sent to an agent.
 */
export interface SecretFilter {
    secretNames: string[];
    allowedKeys?: Record<string, string[]>;
}

/**
 * Secret provider contract for local and external secret backends.
 */
export interface SecretProvider {
    /**
     * Lists secret metadata without exposing secret values.
     * 
     * @returns Secret metadata entries
     */
    list(): Promise<Secret[]>;

    /**
     * Creates or updates a secret in the backing store.
     * 
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    upsert(input: SecretUpsertInput): Promise<Secret>;

    /**
     * Deletes a secret by name.
     * 
     * @param name Secret name
     * @returns Nothing.
     */
    delete(name: string): Promise<void>;

    /**
     * Resolves secret values for control plane internal use.
     * 
     * @param name Secret name
     * @returns Resolved secret payload
     */
    resolve(name: string): Promise<ResolvedSecret>;

    /**
     * Resolves and filters secrets before sending them to an agent.
     * 
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]>;
}
