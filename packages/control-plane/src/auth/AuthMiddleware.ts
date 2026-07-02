import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Paths that never require API key authentication.
 * 
 * @param path Request path without query string
 * @returns Whether the path is public
 */
function isPublicPath(path: string): boolean {
    if (path === "/health" || path.startsWith("/health/")) {
        return true;
    }

    if (path === "/.well-known/platform") {
        return true;
    }

    return false;
}

/**
 * Paths exempt from remote auth (agent bootstrap and local panel key creation).
 * 
 * @param method HTTP method
 * @param path Request path without query string
 * @returns Whether the route is exempt when called remotely
 */
function isRemoteExemptPath(method: string, path: string): boolean {
    if (method === "POST" && path === "/nodes/register") {
        return true;
    }

    return false;
}

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
 * Registers API key authentication for remote control plane access.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
    app.addHook("onRequest", async (request, reply) => {
        const path = request.url.split("?")[0] ?? request.url;

        if (isPublicPath(path)) {
            return;
        }

        if (isLocalRequest(request)) {
            return;
        }

        if (isRemoteExemptPath(request.method, path)) {
            return;
        }

        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            reply.code(401);
            await reply.send({ message: "Unauthorized." });
            return;
        }

        const secret = authHeader.slice("Bearer ".length).trim();
        const valid = await app.controlPlane.store.validateApiKey(secret);
        if (!valid) {
            reply.code(401);
            await reply.send({ message: "Unauthorized." });
            return;
        }
    });
}
