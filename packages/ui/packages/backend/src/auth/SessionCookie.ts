/**
 * HttpOnly session cookie used by the admin BFF.
 */
export const NAULITE_SESSION_COOKIE = "naulite_session";

/**
 * Default cookie lifetime in seconds (8 hours).
 */
export const NAULITE_SESSION_MAX_AGE_SECS = 8 * 60 * 60;

/**
 * Parses a raw Cookie header into a key-value map.
 *
 * @param header Raw Cookie header value
 * @returns Parsed cookie map
 */
export function parseCookies(header: string | undefined): Record<string, string> {
    if (!header) {
        return {};
    }

    const cookies: Record<string, string> = {};

    for (const part of header.split(";")) {
        const trimmed = part.trim();
        const separator = trimmed.indexOf("=");

        if (separator <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separator);
        const value = trimmed.slice(separator + 1);
        cookies[key] = decodeURIComponent(value);
    }

    return cookies;
}

/**
 * Returns whether session cookies should include the Secure attribute.
 *
 * @returns True when Secure cookies are enabled
 */
export function resolveSecureCookies(): boolean {
    const configured = process.env.NAULITE_COOKIE_SECURE?.trim().toLowerCase();

    if (configured === "true" || configured === "1") {
        return true;
    }

    if (configured === "false" || configured === "0") {
        return false;
    }

    return process.env.NODE_ENV === "production";
}

/**
 * Builds a Set-Cookie header value for a platform session.
 *
 * @param token Opaque session token
 * @param maxAge Cookie max age in seconds
 * @returns Set-Cookie header value
 */
export function buildSessionCookie(token: string, maxAge = NAULITE_SESSION_MAX_AGE_SECS): string {
    const secureFlag = resolveSecureCookies() ? "; Secure" : "";
    return `${NAULITE_SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureFlag}`;
}

/**
 * Builds a Set-Cookie header that clears the platform session cookie.
 *
 * @returns Set-Cookie header value
 */
export function buildClearSessionCookie(): string {
    const secureFlag = resolveSecureCookies() ? "; Secure" : "";
    return `${NAULITE_SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureFlag}`;
}
