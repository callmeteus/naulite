import type { FastifyRequest } from "fastify";

/**
 * Returns whether the request originated from the local control plane host.
 *
 * Loopback is always trusted. Docker bridge IPs (172.16.0.0/12) are trusted only
 * when `NAULITE_ALLOW_DOCKER_BRIDGE` or `NAULITE_E2E_ALLOW_BRIDGE` is `1`.
 *
 * @param request Incoming Fastify request
 * @returns Whether the caller is local loopback or an allowed Docker bridge
 */
export function isLocalBootstrapRequest(request: FastifyRequest): boolean {
    const ip = normalizeClientIp(request.ip);

    if (isLoopbackAddress(ip)) {
        return true;
    }

    if (isDockerBridgeBypassEnabled() && isDockerBridgeAddress(ip)) {
        return true;
    }

    return false;
}

/**
 * Strips an IPv4-mapped IPv6 prefix so later checks see a plain IPv4 address.
 *
 * @param ip Raw `request.ip`
 * @returns Normalized address
 */
function normalizeClientIp(ip: string): string {
    if (ip.startsWith("::ffff:")) {
        return ip.slice("::ffff:".length);
    }

    return ip;
}

/**
 * Returns whether `ip` is IPv4 or IPv6 loopback.
 *
 * @param ip Normalized client address
 * @returns `true` for localhost
 */
function isLoopbackAddress(ip: string): boolean {
    return ip === "127.0.0.1" || ip === "::1";
}

/**
 * Returns whether Docker-bridge callers may use the local-auth bypass.
 *
 * @returns `true` when a local-dev or E2E env flag is set
 */
function isDockerBridgeBypassEnabled(): boolean {
    return process.env.NAULITE_ALLOW_DOCKER_BRIDGE === "1"
        || process.env.NAULITE_E2E_ALLOW_BRIDGE === "1";
}

/**
 * Returns whether `ip` is in Docker's default RFC1918 range 172.16.0.0/12.
 *
 * @param ip Normalized IPv4 address
 * @returns `true` for Docker bridge and user-defined bridge networks
 */
function isDockerBridgeAddress(ip: string): boolean {
    const parts = ip.split(".");

    if (parts.length !== 4) {
        return false;
    }

    const first = Number(parts[0]);
    const second = Number(parts[1]);

    if (!Number.isInteger(first) || !Number.isInteger(second)) {
        return false;
    }

    return first === 172 && second >= 16 && second <= 31;
}

/**
 * Resolves the public control plane base URL for agent enrollment.
 *
 * @param request Incoming Fastify request
 * @returns Normalized control plane URL without trailing slash
 */
export function resolvePublicControlPlaneUrl(request: FastifyRequest): string {
    const configured = process.env.NAULITE_PUBLIC_URL?.trim();

    if (configured) {
        return configured.replace(/\/+$/, "");
    }

    const proto = (request.headers["x-forwarded-proto"] as string | undefined) ?? "http";
    const host = (request.headers["x-forwarded-host"] as string | undefined)
        ?? request.headers.host
        ?? "localhost:8080";

    return `${proto}://${host}`.replace(/\/+$/, "");
}

/**
 * Resolves the NetBird management URL exposed to enrolling agents.
 *
 * @returns Normalized management URL without trailing slash or /api suffix
 */
export function resolvePublicNetBirdManagementUrl(): string {
    const configured = process.env.NETBIRD_PUBLIC_MANAGEMENT_URL?.trim()
        ?? process.env.NETBIRD_MANAGEMENT_URL?.trim()
        ?? "";

    return configured.replace(/\/+$/, "").replace(/\/api$/, "");
}
