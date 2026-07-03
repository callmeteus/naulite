import type { AdminRole, AdminUser } from "@platform/sdk";
import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import { PLATFORM_SESSION_COOKIE, parseCookies } from "./SessionCookie";

/**
 * Route-level role authorization pre-handlers for the admin BFF.
 */
export namespace RolePreHandlers {
    /**
     * Builds a preHandler that requires one of the given admin roles.
     *
     * @param roles Allowed roles
     * @returns Fastify preHandler
     */
    export function requireRoles(...roles: AdminRole[]): preHandlerHookHandler {
        return async (request) => {
            const user = request.adminUser;

            if (!user) {
                throw createForbiddenError("Sessão inválida.");
            }

            if (!roles.includes(user.role)) {
                throw createForbiddenError("Permissão insuficiente.");
            }
        };
    }

    /**
     * Returns true when the request has at least viewer access.
     *
     * @param request Incoming Fastify request
     * @returns Whether the user can read cluster resources
     */
    export function canView(request: FastifyRequest): boolean {
        return hasRole(request, "viewer", "operator", "admin");
    }

    /**
     * Returns true when the request can mutate operational resources.
     *
     * @param request Incoming Fastify request
     * @returns Whether the user can run builds, apply, and provision
     */
    export function canOperate(request: FastifyRequest): boolean {
        return hasRole(request, "operator", "admin");
    }

    /**
     * Returns true when the request has admin privileges.
     *
     * @param request Incoming Fastify request
     * @returns Whether the user can manage secrets and users
     */
    export function canAdmin(request: FastifyRequest): boolean {
        return hasRole(request, "admin");
    }

    /**
     * Reads the platform session token from the request cookie jar.
     *
     * @param request Incoming Fastify request
     * @returns Session token when present
     */
    export function readSessionToken(request: FastifyRequest): string | undefined {
        const cookies = parseCookies(request.headers.cookie);
        const cookieValue = cookies[PLATFORM_SESSION_COOKIE];

        if (typeof cookieValue === "string" && cookieValue.length > 0) {
            return cookieValue;
        }

        return undefined;
    }
}

/**
 * Checks whether the request user has one of the allowed roles.
 *
 * @param request Incoming Fastify request
 * @param roles Allowed roles
 * @returns True when the user role matches
 */
function hasRole(request: FastifyRequest, ...roles: AdminRole[]): boolean {
    const user = request.adminUser;
    return Boolean(user && roles.includes(user.role));
}

/**
 * Synthetic admin user used for legacy bearer automation.
 */
export const SERVICE_ADMIN_USER: AdminUser = {
    id: "service-admin",
    email: "service@platform.local",
    role: "admin",
    tenantId: null,
    createdAt: new Date(0).toISOString()
};

/**
 * Creates a Fastify-compatible 403 error.
 *
 * @param message Error message
 * @returns Error with statusCode 403
 */
function createForbiddenError(message: string): Error & { statusCode: number } {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = 403;
    return error;
}
