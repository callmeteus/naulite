/**
 * Fine-grained platform permissions (resource:action).
 */
export type PlatformPermission =
    | "secrets:read"
    | "secrets:write"
    | "nodes:read"
    | "nodes:provision"
    | "nodes:terminate"
    | "manifests:apply"
    | "backups:run"
    | "notifications:write"
    | "admin:users:read"
    | "admin:users:write";

/**
 * Static permission catalog grouped by domain.
 */
export namespace PermissionCatalog {
    /**
     * @returns All defined platform permissions
     */
    export function all(): PlatformPermission[] {
        return [
            "secrets:read",
            "secrets:write",
            "nodes:read",
            "nodes:provision",
            "nodes:terminate",
            "manifests:apply",
            "backups:run",
            "notifications:write",
            "admin:users:read",
            "admin:users:write"
        ];
    }
}
