import type { AdminRole } from "./AdminAuthTypes";
import type { PlatformPermission } from "./PermissionCatalog";

const VIEWER_PERMISSIONS: PlatformPermission[] = [
    "secrets:read",
    "nodes:read",
    "admin:users:read"
];

const OPERATOR_PERMISSIONS: PlatformPermission[] = [
    ...VIEWER_PERMISSIONS,
    "secrets:write",
    "nodes:provision",
    "nodes:terminate",
    "manifests:apply",
    "backups:run",
    "notifications:write"
];

const ADMIN_PERMISSIONS: PlatformPermission[] = [
    ...OPERATOR_PERMISSIONS,
    "admin:users:write"
];

/**
 * Maps admin roles to fine-grained permissions.
 */
export namespace RolePermissions {
    /**
     * @param role Admin role
     * @returns Permissions granted to the role
     */
    export function forRole(role: AdminRole): PlatformPermission[] {
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
    export function roleHasPermission(role: AdminRole, permission: PlatformPermission): boolean {
        return forRole(role).includes(permission);
    }
}
