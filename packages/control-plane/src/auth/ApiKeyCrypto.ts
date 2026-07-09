import { createHash, randomBytes } from "node:crypto";

/**
 * Generates and validates panel-issued CLI API keys.
 */
export namespace ApiKeyCrypto {
    /**
     * Prefix applied to generated API key secrets.
     */
    const PREFIX = "plt_";

    /**
     * Creates a new API key secret and its stored hash metadata.
     * 
     * @returns Plaintext secret, display prefix, and hash for persistence
     */
    export function generate(): { secret: string; prefix: string; keyHash: string } {
        const secret = `${PREFIX}${randomBytes(24).toString("base64url")}`;
        const prefix = secret.slice(0, 12);
        return {
            secret,
            prefix,
            keyHash: hashSecret(secret)
        };
    }

    /**
     * Hashes an API key secret for database storage.
     * 
     * @param secret Plaintext API key secret
     * @returns Hex-encoded SHA-256 hash
     */
    export function hashSecret(secret: string): string {
        return createHash("sha256").update(secret, "utf8").digest("hex");
    }

    /**
     * Checks whether a plaintext secret matches a stored hash.
     * 
     * @param secret Plaintext API key secret
     * @param keyHash Stored hash value
     * @returns Whether the secret matches the hash
     */
    export function matches(secret: string, keyHash: string): boolean {
        return hashSecret(secret) === keyHash;
    }
}
