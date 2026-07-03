import type { ResolvedSecret, Secret, SecretFilter, SecretUpsertInput } from "@platform/shared";

/**
 * Options for the Infisical secret provider stub.
 */
export interface InfisicalSecretProviderOptions {
    apiUrl?: string;
    projectId?: string;
    environment?: string;
}

/**
 * Infisical secret provider stub that documents the external integration contract.
 */
export class InfisicalSecretProvider {
    readonly id = "infisical";

    /**
     * Creates an Infisical secret provider stub.
     *
     * @param options Infisical connection options
     */
    constructor(private readonly options: InfisicalSecretProviderOptions = {}) {}

    /**
     * Lists secret metadata from Infisical.
     *
     * @returns Secret metadata entries
     */
    async list(): Promise<Secret[]> {
        console.debug(
            "[plugin-infisical] list apiUrl=%s projectId=%s environment=%s",
            this.options.apiUrl ?? "-",
            this.options.projectId ?? "-",
            this.options.environment ?? "-"
        );
        return [];
    }

    /**
     * Creates or updates a secret in Infisical.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        throw new Error(
            `Infisical secret provider is not configured. Cannot upsert secret ${input.name}.`
        );
    }

    /**
     * Deletes a secret from Infisical.
     *
     * @param name Secret name
     * @returns Nothing.
     */
    async delete(name: string): Promise<void> {
        throw new Error(
            `Infisical secret provider is not configured. Cannot delete secret ${name}.`
        );
    }

    /**
     * Resolves secret values from Infisical.
     *
     * @param name Secret name
     * @returns Resolved secret payload
     */
    async resolve(name: string): Promise<ResolvedSecret> {
        throw new Error(
            `Infisical secret provider is not configured. Cannot resolve secret ${name}.`
        );
    }

    /**
     * Resolves and filters secrets before sending them to an agent.
     *
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    async resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]> {
        console.debug("[plugin-infisical] resolveForAgent names=%o", filter.secretNames);
        return [];
    }
}

const infisicalSecretProvider = new InfisicalSecretProvider({
    apiUrl: process.env.INFISICAL_API_URL,
    projectId: process.env.INFISICAL_PROJECT_ID,
    environment: process.env.INFISICAL_ENVIRONMENT
});

/**
 * Plugin registration for the Infisical secret provider stub.
 */
export const infisicalSecretPluginRegistration = {
    id: "infisical",
    type: "secret" as const,
    version: "0.1.0",
    secretProvider: infisicalSecretProvider
};

export default infisicalSecretPluginRegistration;
