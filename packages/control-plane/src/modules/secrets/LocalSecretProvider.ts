import type { ResolvedSecret, Secret, SecretFilter, SecretUpsertInput } from "@platform/shared";

import { AesEncryption } from "./AesEncryption";
import { SecretProvider } from "./SecretProvider";

/**
 * Options for the local encrypted secret provider.
 */
export interface LocalSecretProviderOptions {
    masterKey: string;
}

interface StoredSecret {
    metadata: Secret;
    ciphertext: string;
}

/**
 * Local secret provider that encrypts secret payloads at rest with AES-256-GCM.
 */
export class LocalSecretProvider extends SecretProvider {
    private readonly encryption: AesEncryption;
    private readonly secrets = new Map<string, StoredSecret>();

    /**
     * Creates a local encrypted secret provider.
     * 
     * @param options Provider options including the master encryption key
     */
    constructor(options: LocalSecretProviderOptions) {
        super();
        this.encryption = new AesEncryption(options.masterKey);
    }

    /**
     * Lists secret metadata without exposing secret values.
     * 
     * @returns Secret metadata entries
     */
    async list(): Promise<Secret[]> {
        console.debug("[secrets] list count=%d", this.secrets.size);
        return [...this.secrets.values()].map((entry) => entry.metadata);
    }

    /**
     * Creates or updates a secret in the encrypted local store.
     * 
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        const now = new Date().toISOString();
        const existing = this.secrets.get(input.name);
        const metadata: Secret = {
            id: existing?.metadata.id ?? `secret_${input.name}`,
            name: input.name,
            keys: Object.keys(input.data),
            scope: input.scope ?? "cluster",
            serviceName: input.serviceName,
            description: input.description,
            createdAt: existing?.metadata.createdAt ?? now,
            updatedAt: now
        };

        console.debug("[secrets] upsert name=%s keys=%o scope=%s", input.name, metadata.keys, metadata.scope);
        const ciphertext = this.encryption.encrypt(JSON.stringify(input.data));
        this.secrets.set(input.name, { metadata, ciphertext });
        return metadata;
    }

    /**
     * Deletes a secret by name.
     * 
     * @param name Secret name
     * @returns Nothing.
     */
    async delete(name: string): Promise<void> {
        console.debug("[secrets] delete name=%s", name);
        this.secrets.delete(name);
    }

    /**
     * Resolves secret values for control plane internal use.
     * 
     * @param name Secret name
     * @returns Resolved secret payload
     */
    async resolve(name: string): Promise<ResolvedSecret> {
        const entry = this.secrets.get(name);
        if (!entry) {
            throw new Error(`Secret not found: ${name}`);
        }

        console.debug("[secrets] resolve name=%s", name);
        const data = JSON.parse(this.encryption.decrypt(entry.ciphertext)) as Record<string, string>;
        return { name, data };
    }

    /**
     * Resolves and filters secrets before sending them to an agent.
     * 
     * @param filter Allowed secret names and optional key filters
     * @returns Filtered secret payloads safe for agent delivery
     */
    async resolveForAgent(filter: SecretFilter): Promise<ResolvedSecret[]> {
        console.debug("[secrets] resolveForAgent names=%o", filter.secretNames);
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
 * Creates a local encrypted secret provider.
 * 
 * @param options Provider options including the master encryption key
 * @returns Configured secret provider
 */
export function createLocalSecretProvider(options: LocalSecretProviderOptions): LocalSecretProvider {
    return new LocalSecretProvider(options);
}
