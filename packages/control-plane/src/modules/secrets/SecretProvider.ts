import type { ResolvedSecret, Secret, SecretFilter, SecretUpsertInput } from "@naulite/shared";

/**
 * Abstract secret provider contract for local and plugin backends.
 */
export abstract class SecretProvider {
    /**
     * Lists secret metadata without exposing secret values.
     *
     * @returns Secret metadata entries
     */
    abstract list(): Promise<Secret[]>;

    /**
     * Creates or updates a secret in the backing store.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    abstract upsert(input: SecretUpsertInput): Promise<Secret>;

    /**
     * Deletes a secret by name.
     *
     * @param name Secret name
     * @returns Nothing.
     */
    abstract delete(name: string): Promise<void>;

    /**
     * Resolves secret values for control plane internal use.
     *
     * @param name Secret name
     * @returns Resolved secret payload
     */
    abstract resolve(name: string): Promise<ResolvedSecret>;

    /**
     * Resolves and filters secrets before sending them to an agent.
     *
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    abstract resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]>;
}
