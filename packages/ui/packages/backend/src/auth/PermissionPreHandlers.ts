import type { FastifyRequest } from "fastify";
import type { AdminRole, NaulitePermission } from "@naulite/shared";
import { RolePermissions } from "@naulite/shared";

/**
 * BFF permission checks aligned with the control plane catalog.
 */
export namespace PermissionPreHandlers {
    /**
     * Returns true when the request user has the required permission.
     *
     * @param request Incoming Fastify request
     * @param permission Required permission
     * @returns Whether the user is authorized
     */
    export function hasPermission(request: FastifyRequest, permission: NaulitePermission): boolean {
        const user = request.adminUser;

        if (!user) {
            return false;
        }

        return RolePermissions.roleHasPermission(user.role as AdminRole, permission);
    }

    /**
     * Returns true when the request user has every required permission.
     *
     * @param request Incoming Fastify request
     * @param permissions Required permissions
     * @returns Whether the user is authorized
     */
    export function hasEveryPermission(
        request: FastifyRequest,
        permissions: NaulitePermission[]
    ): boolean {
        return permissions.every((permission) => hasPermission(request, permission));
    }
}

/**
 * Resolves BFF route permissions from path and HTTP method.
 *
 * @param path Request path without query string
 * @param method HTTP method
 * @returns Required permissions for the route
 */
export function resolveBffRoutePermissions(path: string, method: string): NaulitePermission[] {
    const upperMethod = method.toUpperCase();
    const isRead = upperMethod === "GET" || upperMethod === "HEAD";

    if (path.startsWith("/admin/users")) {
        return isRead ? ["admin:users:read"] : ["admin:users:write"];
    }

    if (path.startsWith("/api-keys")) {
        return isRead ? ["admin:api-keys:read"] : ["admin:api-keys:write"];
    }

    if (path.startsWith("/secrets")) {
        return isRead ? ["secrets:read"] : ["secrets:write"];
    }

    if (path.startsWith("/notifications")) {
        if (path.endsWith("/test") || path.includes("/filters")) {
            return ["notifications:write"];
        }

        return isRead ? ["notifications:read"] : ["notifications:write"];
    }

    if (path.startsWith("/metrics") || path.startsWith("/cluster")) {
        return ["metrics:read"];
    }

    if (path.includes("/host/")) {
        if (path.includes("/packages/update") || path.includes("/system/update")) {
            return ["nodes:host-update"];
        }

        return ["nodes:read"];
    }

    if (
        path.startsWith("/services") ||
        path.startsWith("/instances") ||
        path.startsWith("/volumes") ||
        path.startsWith("/nodes") && !path.includes("/provision")
    ) {
        return isRead ? ["workloads:read"] : ["workloads:write"];
    }

    if (path.startsWith("/runs")) {
        return isRead ? ["runs:read"] : ["runs:write"];
    }

    if (path.startsWith("/gitops")) {
        return path.includes("/rollback") ? ["gitops:rollback"] : ["gitops:read"];
    }

    if (path.startsWith("/cr") || path.startsWith("/gateway") || path.startsWith("/ingress")) {
        return isRead ? ["registry:read"] : ["registry:write"];
    }

    if (path.startsWith("/backups")) {
        if (path.includes("/restore")) {
            return ["backups:restore"];
        }

        if (path.endsWith("/run") || upperMethod === "POST") {
            return ["backups:run"];
        }

        return ["backups:read"];
    }

    if (path.startsWith("/netbird")) {
        return isRead ? ["netbird:read"] : ["netbird:write"];
    }

    if (path === "/apply" && upperMethod === "POST") {
        return ["manifests:apply"];
    }

    if (path === "/build" && upperMethod === "POST") {
        return ["runs:write"];
    }

    if (path.startsWith("/nodes/provision") || path.startsWith("/nodes/provisions")) {
        if (path.endsWith("/terminate")) {
            return ["nodes:terminate"];
        }

        return ["nodes:provision"];
    }

    return ["nodes:read"];
}
