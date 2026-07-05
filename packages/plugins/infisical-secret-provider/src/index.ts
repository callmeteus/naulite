import type { ResolvedSecret, Secret, SecretFilter, SecretUpsertInput } from "@naulite/shared";

import { InfisicalApiClient, type InfisicalRawSecret } from "./InfisicalApiClient";
import { InfisicalNotConfiguredError } from "./InfisicalNotConfiguredError";

/**
 * Options for the Infisical secret provider stub.
 */
export interface InfisicalSecretProviderOptions {
    apiUrl?: string;
    token?: string;
    projectId?: string;
    environment?: string;
    secretPath?: string;
    client?: InfisicalApiClient;
}

/**
 * Infisical secret provider stub that documents the external integration contract.
 */
export class InfisicalSecretProvider {
    readonly id = "infisical";
    private readonly client: InfisicalApiClient;

    /**
     * Creates an Infisical secret provider stub.
     *
     * @param options Infisical connection options
     */
    constructor(private readonly options: InfisicalSecretProviderOptions = {}) {
        this.client = options.client ?? new InfisicalApiClient({
            apiUrl: options.apiUrl,
            token: options.token,
            projectId: options.projectId,
            environment: options.environment,
            secretPath: options.secretPath
        });
    }

    /**
     * Lists secret metadata from Infisical.
     *
     * @returns Secret metadata entries
     */
    async list(): Promise<Secret[]> {
        console.debug(
            "[plugin-infisical] list apiUrl=%s projectId=%s environment=%s",
            this.options.apiUrl ?? process.env.INFISICAL_API_URL ?? "-",
            this.options.projectId ?? process.env.INFISICAL_PROJECT_ID ?? "-",
            this.options.environment ?? process.env.INFISICAL_ENVIRONMENT ?? "-"
        );

        if (!this.client.isConfigured()) {
            return [];
        }

        const secrets = await this.client.listSecrets();
        return secrets.map((entry) => this.toSecretMetadata(entry));
    }

    /**
     * Creates or updates a secret in Infisical.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        this.assertConfigured(`Cannot upsert secret ${input.name}.`);
        const secretValue = JSON.stringify(input.data);

        let stored: InfisicalRawSecret;
        try {
            await this.client.getSecret(input.name);
            stored = await this.client.updateSecret(input.name, secretValue);
        } catch {
            stored = await this.client.createSecret(input.name, secretValue);
        }

        console.debug("[plugin-infisical] upsert name=%s keys=%o", input.name, Object.keys(input.data));
        return this.toSecretMetadata(stored, input);
    }

    /**
     * Deletes a secret from Infisical.
     *
     * @param name Secret name
     * @returns Nothing.
     */
    async delete(name: string): Promise<void> {
        this.assertConfigured(`Cannot delete secret ${name}.`);
        console.debug("[plugin-infisical] delete name=%s", name);
        await this.client.deleteSecret(name);
    }

    /**
     * Resolves secret values from Infisical.
     *
     * @param name Secret name
     * @returns Resolved secret payload
     */
    async resolve(name: string): Promise<ResolvedSecret> {
        this.assertConfigured(`Cannot resolve secret ${name}.`);
        console.debug("[plugin-infisical] resolve name=%s", name);
        const secret = await this.client.getSecret(name);
        return {
            name,
            data: this.parseSecretData(secret.secretValue)
        };
    }

    /**
     * Resolves and filters secrets before sending them to an agent.
     *
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    async resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]> {
        console.debug("[plugin-infisical] resolveForAgent names=%o", filter.secretNames);

        if (!this.client.isConfigured()) {
            return [];
        }

        const resolved: ResolvedSecret[] = [];

        for (const secretName of filter.secretNames) {
            const secret = await this.resolve(secretName);
            const allowedKeys = filter.allowedKeys?.[secretName];

            if (!allowedKeys || allowedKeys.length === 0) {
                resolved.push(secret);
                continue;
            }

            const filteredData: Record<string, string> = {};
            for (const key of allowedKeys) {
                if (secret.data[key] !== undefined) {
                    filteredData[key] = secret.data[key];
                }
            }

            resolved.push({ name: secret.name, data: filteredData });
        }

        return resolved;
    }

    /**
     * Ensures Infisical is configured before mutating or resolving secrets.
     *
     * @param detail Optional operation detail
     * @returns Nothing.
     */
    private assertConfigured(detail?: string): void {
        if (!this.client.isConfigured()) {
            throw new InfisicalNotConfiguredError(
                detail
                    ? `Infisical secret provider is not configured. ${detail}`
                    : undefined
            );
        }
    }

    /**
     * Parses a stored Infisical secret value into key/value pairs.
     *
     * @param secretValue Raw secret value from Infisical
     * @returns Parsed secret data map
     */
    private parseSecretData(secretValue: string): Record<string, string> {
        try {
            const parsed = JSON.parse(secretValue) as unknown;

            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const data: Record<string, string> = {};
                for (const [key, value] of Object.entries(parsed)) {
                    if (typeof value === "string") {
                        data[key] = value;
                    }
                }

                if (Object.keys(data).length > 0) {
                    return data;
                }
            }
        } catch {
            // Fall back to a single-value secret payload.
        }

        return { value: secretValue };
    }

    /**
     * Maps an Infisical raw secret to platform secret metadata.
     *
     * @param entry Infisical raw secret entry
     * @param input Optional upsert input for scope metadata
     * @returns Naulite secret metadata
     */
    private toSecretMetadata(entry: InfisicalRawSecret, input?: SecretUpsertInput): Secret {
        const data = input?.data ?? this.parseSecretData(entry.secretValue);
        const now = new Date().toISOString();

        return {
            id: `secret_${entry.secretKey}`,
            name: entry.secretKey,
            keys: Object.keys(data),
            scope: input?.scope ?? "cluster",
            serviceName: input?.serviceName,
            description: input?.description,
            createdAt: entry.createdAt ?? now,
            updatedAt: entry.updatedAt ?? now
        };
    }
}

const infisicalSecretProvider = new InfisicalSecretProvider({
    apiUrl: process.env.INFISICAL_API_URL,
    token: process.env.INFISICAL_TOKEN,
    projectId: process.env.INFISICAL_PROJECT_ID,
    environment: process.env.INFISICAL_ENVIRONMENT,
    secretPath: process.env.INFISICAL_SECRET_PATH
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

export { InfisicalApiClient, type InfisicalApiClientOptions, type InfisicalRawSecret } from "./InfisicalApiClient";
export { InfisicalNotConfiguredError } from "./InfisicalNotConfiguredError";
