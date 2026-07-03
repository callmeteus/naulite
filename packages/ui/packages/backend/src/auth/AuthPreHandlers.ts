import type { FastifyRequest, preHandlerHookHandler } from "fastify";

/**
 * Route-level authentication pre-handlers for the admin BFF.
 */
export namespace AuthPreHandlers {
    /**
     * Builds a preHandler that validates the admin API key on incoming requests.
     *
     * @param adminApiKey Expected bearer token; when unset, all requests are rejected
     * @returns Fastify preHandler
     */
    export function requireAdminApiKey(adminApiKey: string | undefined): preHandlerHookHandler {
        return async (request) => {
            enforceAdminApiKey(request, adminApiKey);
        };
    }

    /**
     * Validates the Authorization bearer token against the configured admin API key.
     *
     * @param request Incoming Fastify request
     * @param adminApiKey Expected bearer token
     * @returns Nothing.
     */
    export function enforceAdminApiKey(request: FastifyRequest, adminApiKey: string | undefined): void {
        if (!adminApiKey) {
            throw createUnauthorizedError("Admin API key is not configured.");
        }

        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
            throw createUnauthorizedError("Unauthorized.");
        }

        const token = authHeader.slice("Bearer ".length).trim();

        if (token !== adminApiKey) {
            throw createUnauthorizedError("Unauthorized.");
        }
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
