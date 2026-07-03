import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Supported GitOps webhook signature providers.
 */
export type GitOpsWebhookProvider = "github" | "gitlab" | "generic";

/**
 * Options for verifying a GitOps webhook signature.
 */
export interface VerifyGitOpsWebhookSignatureOptions {
    provider: GitOpsWebhookProvider;
    secret: string;
    rawBody: Buffer | string;
    headers: Record<string, string | string[] | undefined>;
}

/**
 * Verifies GitOps webhook signatures for GitHub, GitLab, or a generic HMAC header.
 */
export namespace WebhookSignature {
    /**
     * Verifies the webhook signature using the configured provider rules.
     *
     * @param options Verification inputs
     * @returns Whether the signature is valid
     */
    export function verify(options: VerifyGitOpsWebhookSignatureOptions): boolean {
        const secret = options.secret.trim();

        if (!secret) {
            return false;
        }

        const rawBody = typeof options.rawBody === "string"
            ? Buffer.from(options.rawBody, "utf8")
            : options.rawBody;

        if (options.provider === "github") {
            return verifyGitHub(secret, rawBody, options.headers);
        }

        if (options.provider === "gitlab") {
            return verifyGitLab(secret, options.headers);
        }

        return verifyGeneric(secret, rawBody, options.headers);
    }

    /**
     * Verifies a GitHub `X-Hub-Signature-256` header.
     *
     * @param secret Webhook secret
     * @param rawBody Raw request body
     * @param headers Request headers
     * @returns Whether the signature matches
     */
    function verifyGitHub(
        secret: string,
        rawBody: Buffer,
        headers: Record<string, string | string[] | undefined>
    ): boolean {
        const signatureHeader = readHeader(headers, "x-hub-signature-256");

        if (!signatureHeader?.startsWith("sha256=")) {
            return false;
        }

        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        const received = signatureHeader.slice("sha256=".length);

        return safeEqualHex(expected, received);
    }

    /**
     * Verifies a GitLab webhook token header.
     *
     * @param secret Shared webhook token
     * @param headers Request headers
     * @returns Whether the token matches
     */
    function verifyGitLab(
        secret: string,
        headers: Record<string, string | string[] | undefined>
    ): boolean {
        const token = readHeader(headers, "x-gitlab-token");

        if (!token) {
            return false;
        }

        return safeEqualString(secret, token);
    }

    /**
     * Verifies a generic `X-Platform-Signature` HMAC-SHA256 header.
     *
     * @param secret Shared webhook secret
     * @param rawBody Raw request body
     * @param headers Request headers
     * @returns Whether the signature matches
     */
    function verifyGeneric(
        secret: string,
        rawBody: Buffer,
        headers: Record<string, string | string[] | undefined>
    ): boolean {
        const signatureHeader = readHeader(headers, "x-platform-signature");

        if (!signatureHeader) {
            return false;
        }

        const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
        return safeEqualHex(expected, signatureHeader);
    }

    /**
     * Reads a request header as a trimmed string.
     *
     * @param headers Request headers
     * @param name Header name
     * @returns Header value or undefined
     */
    function readHeader(
        headers: Record<string, string | string[] | undefined>,
        name: string
    ): string | undefined {
        const value = headers[name];

        if (typeof value === "string") {
            return value.trim();
        }

        if (Array.isArray(value) && typeof value[0] === "string") {
            return value[0].trim();
        }

        return undefined;
    }

    /**
     * Compares two hex strings in constant time.
     *
     * @param expected Expected hex digest
     * @param received Received hex digest
     * @returns Whether the values match
     */
    function safeEqualHex(expected: string, received: string): boolean {
        if (expected.length !== received.length) {
            return false;
        }

        try {
            return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
        } catch {
            return false;
        }
    }

    /**
     * Compares two strings in constant time.
     *
     * @param expected Expected value
     * @param received Received value
     * @returns Whether the values match
     */
    function safeEqualString(expected: string, received: string): boolean {
        const expectedBuffer = Buffer.from(expected);
        const receivedBuffer = Buffer.from(received);

        if (expectedBuffer.length !== receivedBuffer.length) {
            return false;
        }

        return timingSafeEqual(expectedBuffer, receivedBuffer);
    }
}
