import type {
    ResolvedSecret,
    Secret,
    SecretFilter,
    SecretProvider as SharedSecretProvider,
    SecretUpsertInput
} from "@naulite/shared";

import { SecretProvider } from "./SecretProvider";

/**
 * Adapts a plugin secret provider into the control plane secret provider contract.
 */
export class PluginSecretProviderAdapter extends SecretProvider {
    /**
     * Creates a plugin secret provider adapter.
     *
     * @param delegate Plugin secret provider instance
     */
    constructor(private readonly delegate: SharedSecretProvider) {
        super();
    }

    /**
     * Lists secret metadata without exposing secret values.
     *
     * @returns Secret metadata entries
     */
    async list(): Promise<Secret[]> {
        return this.delegate.list();
    }

    /**
     * Creates or updates a secret in the backing store.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        return this.delegate.upsert(input);
    }

    /**
     * Deletes a secret by name.
     *
     * @param name Secret name
     * @returns Nothing.
     */
    async delete(name: string): Promise<void> {
        await this.delegate.delete(name);
    }

    /**
     * Resolves secret values for control plane internal use.
     *
     * @param name Secret name
     * @returns Resolved secret payload
     */
    async resolve(name: string): Promise<ResolvedSecret> {
        return this.delegate.resolve(name);
    }

    /**
     * Resolves and filters secrets before sending them to an agent.
     *
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    async resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]> {
        return this.delegate.resolveForAgent(filter);
    }
}

/**
 * Resolves the active secret backend id from environment variables.
 *
 * @returns Secret backend id
 */
export function resolveSecretBackendId(): string {
    if (process.env.SECRET_BACKEND) {
        return process.env.SECRET_BACKEND;
    }

    return "postgres";
}
