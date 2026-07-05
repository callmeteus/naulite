import { randomBytes } from "node:crypto";

import type { FastifyRequest } from "fastify";

import { parseCookies } from "./SessionCookie";

/**
 * Cookie name for the CSRF double-submit token.
 */
export const NAULITE_CSRF_COOKIE = "naulite_csrf";

/**
 * Header name clients must send on mutating BFF requests.
 */
export const NAULITE_CSRF_HEADER = "x-csrf-token";

/**
 * CSRF double-submit validation for browser sessions.
 */
export namespace CsrfProtection {
    /**
     * Generates a new CSRF token.
     *
     * @returns Random CSRF token
     */
    export function generateToken(): string {
        return randomBytes(32).toString("hex");
    }

    /**
     * Builds a Set-Cookie header for the CSRF token.
     *
     * @param token CSRF token value
     * @param secure Whether to add the Secure attribute
     * @returns Set-Cookie header value
     */
    export function buildCsrfCookie(token: string, secure: boolean): string {
        const secureFlag = secure ? "; Secure" : "";
        return `${NAULITE_CSRF_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/${secureFlag}`;
    }

    /**
     * Builds a Set-Cookie header that clears the CSRF cookie.
     *
     * @param secure Whether to add the Secure attribute
     * @returns Set-Cookie header value
     */
    export function buildClearCsrfCookie(secure: boolean): string {
        const secureFlag = secure ? "; Secure" : "";
        return `${NAULITE_CSRF_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`;
    }

    /**
     * Returns true when the request must include a valid CSRF token.
     *
     * @param request Incoming Fastify request
     * @returns Whether CSRF validation applies
     */
    export function requiresValidation(request: FastifyRequest): boolean {
        const method = request.method.toUpperCase();

        if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
            return false;
        }

        if (!request.sessionToken) {
            return false;
        }

        return true;
    }

    /**
     * Validates the CSRF header against the CSRF cookie.
     *
     * @param request Incoming Fastify request
     * @returns Whether the CSRF token is valid
     */
    export function isValid(request: FastifyRequest): boolean {
        const cookies = parseCookies(request.headers.cookie);
        const cookieToken = cookies[NAULITE_CSRF_COOKIE];
        const headerToken = request.headers[NAULITE_CSRF_HEADER];

        if (!cookieToken || typeof headerToken !== "string") {
            return false;
        }

        return cookieToken === headerToken;
    }
}
