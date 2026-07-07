import type { Secret, SecretUpsertInput } from "@naulite/shared";

import type { ControlPlaneStore } from "../database/ControlPlaneStore";
import { SecretModel } from "../database/models/index";
import { Logger } from "../Logger";
import { AesEncryption } from "../modules/secrets/AesEncryption";
import { JsonField } from "../util/RowMapper";
const log_secrets = Logger.create("secrets");


const ENCRYPTED_VALUE_KEY = "__encrypted";

/**
 * Database-backed secret service with AES encryption at rest.
 */
export class SecretsService {
    private readonly encryption: AesEncryption;

    /**
     * Creates a secrets service.
     *
     * @param store Control plane persistence layer
     * @param masterKey Master encryption key material
     */
    constructor(
        private readonly store: ControlPlaneStore,
        masterKey: string
    ) {
        this.encryption = new AesEncryption(masterKey);
    }

    /**
     * Lists secret metadata without exposing secret values.
     *
     * @returns Secret metadata records
     */
    async list(): Promise<Secret[]> {
        return this.store.listSecrets();
    }

    /**
     * Returns secret metadata by name.
     *
     * @param name Secret name
     * @returns Secret metadata when found
     */
    async getByName(name: string): Promise<Secret | null> {
        const secrets = await this.store.listSecrets();
        return secrets.find((secret) => secret.name === name) ?? null;
    }

    /**
     * Creates or updates a cluster secret with encrypted values at rest.
     *
     * @param input Secret upsert payload
     * @returns Stored secret metadata
     */
    async upsert(input: SecretUpsertInput): Promise<Secret> {
        const ciphertext = this.encryption.encrypt(JSON.stringify(input.data));
        const existing = await this.getByName(input.name);
        const now = new Date().toISOString();
        const metadata: Secret = {
            id: existing?.id ?? `secret:${input.name}`,
            name: input.name,
            keys: Object.keys(input.data),
            scope: input.scope ?? "cluster",
            serviceName: input.serviceName,
            description: input.description,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        };

        log_secrets.debug("upsert name=%s keys=%o scope=%s", input.name, metadata.keys, metadata.scope);
        await this.store.upsertClusterSecret({
            name: input.name,
            keys: metadata.keys,
            value: {
                [ENCRYPTED_VALUE_KEY]: ciphertext
            },
            description: input.description
        });

        return metadata;
    }

    /**
     * Deletes a secret by name.
     *
     * @param name Secret name
     * @returns Whether a secret was deleted
     */
    async deleteByName(name: string): Promise<boolean> {
        log_secrets.debug("delete name=%s", name);
        return this.store.deleteSecretByName(name);
    }

    /**
     * Resolves decrypted secret values for internal control plane use.
     *
     * @param name Secret name
     * @returns Decrypted secret values when found
     */
    async resolveValues(name: string): Promise<Record<string, string> | null> {
        const row = await SecretModel.findOne({ where: { name } });

        if (!row) {
            return null;
        }

        const plain = row.get({ plain: true }) as { value: unknown };
        const parsed = JsonField.parse<Record<string, unknown>>(plain.value);

        if (!parsed || typeof parsed !== "object") {
            return null;
        }

        const encrypted = parsed[ENCRYPTED_VALUE_KEY];

        if (typeof encrypted === "string") {
            const data = JSON.parse(this.encryption.decrypt(encrypted)) as Record<string, string>;
            log_secrets.debug("resolve name=%s keys=%o", name, Object.keys(data));
            return data;
        }

        const values: Record<string, string> = {};
        for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
                values[key] = value;
            }
        }

        return values;
    }
}

/**
 * Resolves the master encryption key from environment variables.
 *
 * @returns Master encryption key material
 */
export function resolveSecretMasterKey(): string {
    return process.env.SECRET_MASTER_KEY
        ?? process.env.ADMIN_API_KEY
        ?? "naulite-dev-secret-master-key";
}
