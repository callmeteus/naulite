import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * AES-GCM encryption helper for secret payloads at rest.
 */
export class AesEncryption {
    private readonly key: Buffer;

    /**
     * Creates an AES encryption helper from a master key string.
     * 
     * @param masterKey Master key material used to derive the AES key
     */
    constructor(masterKey: string) {
        this.key = createHash("sha256").update(masterKey, "utf8").digest();
    }

    /**
     * Encrypts a UTF-8 payload.
     * 
     * @param plaintext Secret payload to encrypt
     * @returns Base64-encoded ciphertext with IV and auth tag
     */
    encrypt(plaintext: string): string {
        const iv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, this.key, iv);
        const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, authTag, encrypted]).toString("base64");
    }

    /**
     * Decrypts a payload produced by {@link encrypt}.
     * 
     * @param ciphertext Base64-encoded ciphertext with IV and auth tag
     * @returns Decrypted UTF-8 payload
     */
    decrypt(ciphertext: string): string {
        const payload = Buffer.from(ciphertext, "base64");
        const iv = payload.subarray(0, IV_LENGTH);
        const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + 16);
        const encrypted = payload.subarray(IV_LENGTH + 16);
        const decipher = createDecipheriv(ALGORITHM, this.key, iv);
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    }
}
