/**
 * Fine-grained platform permissions (resource:action).
 */
export type NaulitePermission =
    | "secrets:read"
    | "secrets:write"
    | "nodes:read"
    | "nodes:provision"
    | "nodes:terminate"
    | "nodes:host-update"
    | "manifests:apply"
    | "metrics:read"
    | "workloads:read"
    | "workloads:write"
    | "runs:read"
    | "runs:write"
    | "gitops:read"
    | "gitops:rollback"
    | "registry:read"
    | "registry:write"
    | "backups:read"
    | "backups:run"
    | "backups:restore"
    | "netbird:read"
    | "netbird:write"
    | "notifications:read"
    | "notifications:write"
    | "admin:users:read"
    | "admin:users:write"
    | "admin:api-keys:read"
    | "admin:api-keys:write";

/**
 * Static permission catalog grouped by domain.
 */
export namespace PermissionCatalog {
    /**
     * @returns All defined platform permissions
     */
    export function all(): NaulitePermission[] {
        return [
            "secrets:read",
            "secrets:write",
            "nodes:read",
            "nodes:provision",
            "nodes:terminate",
            "nodes:host-update",
            "manifests:apply",
            "metrics:read",
            "workloads:read",
            "workloads:write",
            "runs:read",
            "runs:write",
            "gitops:read",
            "gitops:rollback",
            "registry:read",
            "registry:write",
            "backups:read",
            "backups:run",
            "backups:restore",
            "netbird:read",
            "netbird:write",
            "notifications:read",
            "notifications:write",
            "admin:users:read",
            "admin:users:write",
            "admin:api-keys:read",
            "admin:api-keys:write"
        ];
    }
}
