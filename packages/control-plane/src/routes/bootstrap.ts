import type { FastifyInstance, FastifyRequest } from "fastify";

const SETUP_KEY_SECRET_NAME = "netbird/setup-key";

/**
 * Returns whether the request originated from the local control plane host.
 *
 * @param request Incoming Fastify request
 * @returns Whether the caller is local loopback
 */
function isLocalRequest(request: FastifyRequest): boolean {
    const ip = request.ip;
    return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

/**
 * Resolves the public control plane base URL for agent enrollment.
 *
 * @param request Incoming Fastify request
 * @returns Normalized control plane URL without trailing slash
 */
function resolvePublicControlPlaneUrl(request: FastifyRequest): string {
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
function resolvePublicNetBirdManagementUrl(): string {
    const configured = process.env.NETBIRD_PUBLIC_MANAGEMENT_URL?.trim()
        ?? process.env.NETBIRD_MANAGEMENT_URL?.trim()
        ?? "";

    return configured.replace(/\/+$/, "").replace(/\/api$/, "");
}

/**
 * Registers public agent bootstrap routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBootstrapRoutes(app: FastifyInstance): Promise<void> {
    app.get("/bootstrap/agent", async (request, reply) => {
        const headerKey = request.headers["x-platform-setup-key"];
        const setupKey = typeof headerKey === "string" ? headerKey.trim() : "";

        if (!setupKey) {
            reply.code(401);
            return { message: "Missing setup key." };
        }

        const stored = await app.controlPlane.store.getClusterSecretValues(SETUP_KEY_SECRET_NAME);

        if (!stored?.key || stored.key !== setupKey) {
            reply.code(403);
            return { message: "Invalid setup key." };
        }

        const netbirdManagementUrl = resolvePublicNetBirdManagementUrl();

        if (!netbirdManagementUrl) {
            reply.code(503);
            return { message: "NetBird management URL is not configured." };
        }

        return {
            cpUrl: resolvePublicControlPlaneUrl(request),
            netbirdManagementUrl
        };
    });

    app.get("/bootstrap/setup-key", async (request, reply) => {
        if (!isLocalRequest(request)) {
            reply.code(403);
            return { message: "Forbidden." };
        }

        const setupKey = await app.controlPlane.netBirdEnrollment.ensureSetupKey();

        return { setupKey };
    });
}
