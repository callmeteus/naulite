import type { NaulitePermission } from "./NaulitePermission";

/**
 * Admin panel role assigned to an operator account.
 */
export type AdminRole = "viewer" | "operator" | "admin";

/**
 * Permissions granted to viewer-role operators.
 */
const VIEWER_PERMISSIONS: NaulitePermission[] = [
    "secrets:read",
    "nodes:read",
    "admin:users:read",
    "metrics:read",
    "workloads:read",
    "runs:read",
    "gitops:read",
    "registry:read",
    "backups:read",
    "netbird:read",
    "admin:api-keys:read"
];

/**
 * Permissions granted to operator-role accounts, including viewer access.
 */
const OPERATOR_PERMISSIONS: NaulitePermission[] = [
    ...VIEWER_PERMISSIONS,
    "secrets:write",
    "nodes:provision",
    "nodes:terminate",
    "nodes:host-update",
    "nodes:write",
    "manifests:apply",
    "workloads:write",
    "runs:write",
    "runs:approve",
    "gitops:rollback",
    "registry:write",
    "backups:run",
    "backups:restore",
    "netbird:write",
    "notifications:read",
    "notifications:write"
];

/**
 * Permissions granted to admin-role accounts, including operator access.
 */
const ADMIN_PERMISSIONS: NaulitePermission[] = [
    ...OPERATOR_PERMISSIONS,
    "admin:users:write",
    "admin:api-keys:write"
];

/**
 * Maps admin roles to fine-grained permissions.
 */
export namespace RolePermissions {
    /**
     * @param role Admin role
     * @returns Permissions granted to the role
     */
    export function forRole(role: AdminRole): NaulitePermission[] {
        switch (role) {
            case "viewer":
                return VIEWER_PERMISSIONS;
            case "operator":
                return OPERATOR_PERMISSIONS;
            case "admin":
                return ADMIN_PERMISSIONS;
            default:
                return [];
        }
    }

    /**
     * @param role Admin role
     * @param permission Required permission
     * @returns Whether the role includes the permission
     */
    export function roleHasPermission(role: AdminRole, permission: NaulitePermission): boolean {
        return forRole(role).includes(permission);
    }
}
