import type { FastifyRequest, preHandlerHookHandler } from "fastify";

import { HTTP403Error } from "../errors/TreatedError";
import { AdminAuditService } from "../modules/admin/AdminAuditService";

import { AuthPreHandlers } from "./AuthPreHandlers";
import type { NaulitePermission } from "./PermissionCatalog";
import { RolePermissions } from "./RolePermissions";

/**
 * Route-level permission pre-handlers.
 */
export namespace PermissionPreHandlers {
    /**
     * Builds a preHandler chain that authenticates and requires a permission.
     *
     * @param permission Required permission
     * @returns Fastify preHandler list
     */
    export function authorizedWithPermission(permission: NaulitePermission): preHandlerHookHandler[] {
        return [
            AuthPreHandlers.authorizedLocalOrApiKey,
            requirePermission(permission)
        ];
    }

    /**
     * Builds a preHandler that requires a specific platform permission.
     *
     * @param permission Required permission
     * @returns Fastify preHandler
     */
    export function requirePermission(permission: NaulitePermission): preHandlerHookHandler {
        return async (request) => {
            enforcePermission(request, permission);
        };
    }

    /**
     * Validates that the authenticated request has the required permission.
     *
     * @param request Incoming Fastify request
     * @param permission Required permission
     * @returns Nothing.
     * @throws {HTTP403Error} {@link HTTP403Error}
     */
    export function enforcePermission(request: FastifyRequest, permission: NaulitePermission): void {
        const role = request.role;

        if (!role) {
            throw new HTTP403Error("Forbidden.");
        }

        if (request.authMethod === "api_key" || request.authMethod === "local") {
            return;
        }

        if (!RolePermissions.roleHasPermission(role, permission)) {
            void AdminAuditService.record({
                action: "acl.deny",
                actorUserId: request.adminUser?.id ?? null,
                detail: { permission }
            });

            throw new HTTP403Error("Forbidden.");
        }
    }
}

export type { NaulitePermission };
