import type { ResolvedSecret, Secret, SecretFilter, SecretUpsertInput } from "@naulite/shared";

import type { SecretsService } from "../../services/SecretsService";
import { SecretProvider } from "./SecretProvider";
import { Logger } from "../../Logger";
const log_secrets = Logger.create("secrets");


/**
 * Postgres-backed secret provider that delegates to {@link SecretsService}.
 */
export class PostgresSecretProvider extends SecretProvider {
    /**
     * Creates a postgres secret provider.
     *
     * @param secretsService Encrypted secrets service backed by the control plane store
     */
    constructor(private readonly secretsService: SecretsService) {
        super();
    }

    /**
     * Lists secret metadata without exposing secret values.
     *
     * @returns Secret metadata entries
     */
    async list(): Promise<Secret[]> {
        return this.secretsService.list();
    }

    /**
     * Creates or updates a secret in the encrypted postgres store.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        return this.secretsService.upsert(input);
    }

    /**
     * Deletes a secret by name.
     *
     * @param name Secret name
     * @returns Nothing.
     */
    async delete(name: string): Promise<void> {
        await this.secretsService.deleteByName(name);
    }

    /**
     * Resolves secret values for control plane internal use.
     *
     * @param name Secret name
     * @returns Resolved secret payload
     */
    async resolve(name: string): Promise<ResolvedSecret> {
        const data = await this.secretsService.resolveValues(name);
        if (!data) {
            throw new Error(`Secret not found: ${name}`);
        }

        log_secrets.debug("resolve name=%s", name);
        return { name, data };
    }

    /**
     * Resolves and filters secrets before sending them to an agent.
     *
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    async resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]> {
        log_secrets.debug("resolveForAgent names=%o", filter.secretNames);
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
}

/**
 * Creates a postgres-backed secret provider.
 *
 * @param secretsService Encrypted secrets service backed by the control plane store
 * @returns Configured secret provider
 */
export function createPostgresSecretProvider(secretsService: SecretsService): PostgresSecretProvider {
    return new PostgresSecretProvider(secretsService);
}
