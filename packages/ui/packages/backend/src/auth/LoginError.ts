import { NauliteApiError } from "@naulite/sdk";

import { createBffError, type BffError } from "../errors/BffError";

const UNREACHABLE_CODES = new Set([
    "ECONNREFUSED",
    "ENOTFOUND",
    "EAI_AGAIN",
    "ETIMEDOUT",
    "ECONNRESET",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_SOCKET"
]);

/**
 * Maps control-plane login failures to distinct BFF errors for the login screen.
 */
export namespace LoginError {
    /**
     * Returns whether the control plane rejected the credentials.
     *
     * @param error Thrown value from `adminLogin`
     * @returns `true` when the control plane responded 401
     */
    export function isInvalidCredentials(error: unknown): boolean {
        return error instanceof NauliteApiError && error.status === 401;
    }

    /**
     * Returns whether the control plane could not be reached.
     *
     * @param error Thrown value from `adminLogin`
     * @param depth Recursion depth when walking `error.cause`
     * @returns `true` for transport failures and upstream 502/503/504
     */
    export function isUnreachable(error: unknown, depth = 0): boolean {
        if (depth > 2) {
            return false;
        }

        if (error instanceof NauliteApiError) {
            if (error.status === 503 && error.code === "not_leader") {
                return false;
            }

            return error.status === 502 || error.status === 503 || error.status === 504;
        }

        if (!(error instanceof Error)) {
            return false;
        }

        const message = error.message.toLowerCase();

        if (
            message.includes("fetch failed")
            || message.includes("econnrefused")
            || message.includes("enotfound")
            || message.includes("etimedout")
            || message.includes("network")
        ) {
            return true;
        }

        const code = readErrorCode(error);

        if (code && UNREACHABLE_CODES.has(code)) {
            return true;
        }

        if ("cause" in error) {
            return isUnreachable(error.cause, depth + 1);
        }

        return false;
    }

    /**
     * Converts a login failure into a BFF error with a dedicated i18n key.
     *
     * @param error Thrown value from `adminLogin`
     * @param controlPlaneUrl Control plane URL shown when the service is down
     * @returns Structured BFF error
     */
    export function toBffError(error: unknown, controlPlaneUrl: string): BffError {
        if (isInvalidCredentials(error)) {
            const code = error instanceof NauliteApiError ? error.code : undefined;

            return createBffError(401, "errors.authFailed", {
                code: code ?? "auth_failed"
            });
        }

        if (error instanceof NauliteApiError && error.status === 503 && error.code === "not_leader") {
            return createBffError(503, "errors.notLeader", {
                code: error.code
            });
        }

        return createBffError(503, "errors.controlPlaneUnreachable", {
            code: "control_plane_unreachable",
            i18nParams: { url: controlPlaneUrl }
        });
    }
}

/**
 * Returns whether `value` is a plain object.
 *
 * @param value Unknown value
 * @returns `true` when the value is a non-null object
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Reads a Node-style `code` field from an error object.
 *
 * @param error Unknown thrown value
 * @returns Error code when present
 */
function readErrorCode(error: unknown): string | undefined {
    if (!isRecord(error)) {
        return undefined;
    }

    const code = error["code"];

    if (typeof code !== "string") {
        return undefined;
    }

    return code;
}
