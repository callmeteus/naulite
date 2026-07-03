import type { FastifyRequest } from "fastify";

import type { AdminRole, AdminUserPublic, RequestAuthMethod } from "./AdminAuthTypes";

/**
 * Attaches authenticated admin context to a Fastify request.
 *
 * @param request Incoming request
 * @param auth Resolved authentication context
 * @returns Nothing.
 */
export function attachRequestAuth(
    request: FastifyRequest,
    auth: {
        authMethod: RequestAuthMethod;
        adminUser?: AdminUserPublic;
        role?: AdminRole;
        tenantId?: string | null;
    }
): void {
    request.authMethod = auth.authMethod;
    request.adminUser = auth.adminUser;
    request.role = auth.role;
    request.tenantId = auth.tenantId ?? null;
}

/**
 * Clears authentication context from a request.
 *
 * @param request Incoming request
 * @returns Nothing.
 */
export function clearRequestAuth(request: FastifyRequest): void {
    request.authMethod = undefined;
    request.adminUser = undefined;
    request.role = undefined;
    request.tenantId = undefined;
}
