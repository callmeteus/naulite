import type { FastifyRequest } from "fastify";

import { RolePreHandlers, SERVICE_ADMIN_USER } from "./RolePreHandlers";

/**
 * Route-level authentication pre-handlers for the admin BFF.
 */
export namespace AuthPreHandlers {
    /**
     * Validates the incoming request and attaches adminUser when authenticated.
     *
     * @param request Incoming Fastify request
     * @param adminApiKey Optional legacy service token for automation
     * @returns Nothing.
     * @throws {createUnauthorizedError} {@link createUnauthorizedError}
     */
    export async function authenticateRequest(
        request: FastifyRequest,
        adminApiKey: string | undefined
    ): Promise<void> {
        const sessionToken = RolePreHandlers.readSessionToken(request);

        if (sessionToken) {
            request.sessionToken = sessionToken;

            try {
                const session = await request.server.controlPlane
                    .withSession(sessionToken)
                    .getAdminMe();

                request.adminUser = session.user;
                return;
            } catch {
                throw createUnauthorizedError("Sessão expirada ou inválida.");
            }
        }

        if (adminApiKey) {
            const authHeader = request.headers.authorization;

            if (authHeader?.startsWith("Bearer ")) {
                const token = authHeader.slice("Bearer ".length).trim();

                if (token === adminApiKey) {
                    request.adminUser = SERVICE_ADMIN_USER;
                    return;
                }
            }
        }

        throw createUnauthorizedError("Não autorizado.");
    }

    /**
     * Returns true when the request path is publicly accessible without a session.
     *
     * @param url Request URL
     * @param method HTTP method
     * @returns Whether authentication can be skipped
     */
    export function isPublicRoute(url: string, method: string): boolean {
        const path = url.split("?")[0] ?? url;

        if (path === "/health") {
            return true;
        }

        if (path === "/auth/login" && method === "POST") {
            return true;
        }

        if (path === "/auth/me" && method === "GET") {
            return true;
        }

        return false;
    }
}

/**
 * Creates a Fastify-compatible 401 error.
 *
 * @param message Error message
 * @returns Error with statusCode 401
 */
function createUnauthorizedError(message: string): Error & { statusCode: number } {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = 401;
    return error;
}
