import type { FastifyInstance } from "fastify";

import { AuthPreHandlers } from "./AuthPreHandlers";

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

    if (method === "GET" && path === "/bootstrap/agent") {
        return true;
    }

    if (method === "GET" && path === "/bootstrap/setup-key") {
        return true;
    }

    return false;
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

        if (isRemoteExemptPath(request.method, path)) {
            return;
        }

        await AuthPreHandlers.enforceAuthorization(request, reply, {
            allowLocalBootstrapRequest: true
        });
    });
}
