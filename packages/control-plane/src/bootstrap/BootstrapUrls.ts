import type { FastifyRequest } from "fastify";

/**
 * Returns whether the request originated from the local control plane host.
 *
 * @param request Incoming Fastify request
 * @returns Whether the caller is local loopback
 */
export function isLocalBootstrapRequest(request: FastifyRequest): boolean {
    const ip = request.ip;

    if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") {
        return true;
    }

    // Docker Desktop publishes container ports to the host via the compose bridge gateway.
    if (process.env.PLATFORM_E2E_ALLOW_BRIDGE === "1" && ip.startsWith("172.")) {
        return true;
    }

    return false;
}

/**
 * Resolves the public control plane base URL for agent enrollment.
 *
 * @param request Incoming Fastify request
 * @returns Normalized control plane URL without trailing slash
 */
export function resolvePublicControlPlaneUrl(request: FastifyRequest): string {
    const configured = process.env.PLATFORM_PUBLIC_URL?.trim();

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
