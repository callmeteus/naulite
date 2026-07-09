import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const bcryptPackageRoot = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    "..",
    "node_modules",
    "bcryptjs"
);

const require = createRequire(join(bcryptPackageRoot, "package.json"));
const bcrypt = require(bcryptPackageRoot) as {
    hash: (password: string, rounds: number) => string;
    compare: (password: string, hash: string) => boolean;
};

/**
 * bcrypt cost factor for admin password hashes.
 */
const BCRYPT_ROUNDS = 12;

/**
 * Password hashing helpers for admin users (bcrypt-compatible via bcryptjs).
 */
export namespace AdminPasswordCrypto {
    /**
     * Hashes a plaintext password with bcrypt.
     *
     * @param password Plaintext password
     * @returns Bcrypt hash
     */
    export async function hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    /**
     * Verifies a plaintext password against a stored bcrypt hash.
     *
     * @param password Plaintext password
     * @param passwordHash Stored bcrypt hash
     * @returns Whether the password matches
     */
    export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
        return bcrypt.compare(password, passwordHash);
    }
}
