import { createHash, randomBytes } from "node:crypto";

/**
 * Generates and validates admin session tokens.
 */
export namespace AdminSessionCrypto {
    /**
     * Creates a new session token and its stored hash.
     *
     * @returns Plaintext token and hash for persistence
     */
    export function generate(): { token: string; tokenHash: string } {
        const token = randomBytes(32).toString("base64url");
        return {
            token,
            tokenHash: hashToken(token)
        };
    }

    /**
     * Hashes a session token for database storage.
     *
     * @param token Plaintext session token
     * @returns Hex-encoded SHA-256 hash
     */
    export function hashToken(token: string): string {
        return createHash("sha256").update(token, "utf8").digest("hex");
    }
}
