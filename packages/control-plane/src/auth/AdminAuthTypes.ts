/**
 * Admin panel role identifiers.
 */
export type AdminRole = "viewer" | "operator" | "admin";

/**
 * Authentication method attached to a request after pre-handlers run.
 */
export type RequestAuthMethod = "local" | "session" | "api_key";

/**
 * Public admin user fields exposed by the API.
 */
export interface AdminUserPublic {
    id: string;
    username: string;
    role: AdminRole;
    tenantId: string | null;
    createdAt: string;
    updatedAt: string;
}

/**
 * Result of a successful admin login.
 */
export interface AdminLoginResult {
    sessionToken: string;
    expiresAt: string;
    user: AdminUserPublic;
}

/**
 * Role precedence for authorization checks.
 */
export const ADMIN_ROLE_RANK: Record<AdminRole, number> = {
    viewer: 0,
    operator: 1,
    admin: 2
};

/**
 * Returns whether a role meets the minimum required role.
 *
 * @param role Active role
 * @param minimumRole Minimum allowed role
 * @returns Whether the role is sufficient
 */
export function adminRoleMeetsMinimum(role: AdminRole, minimumRole: AdminRole): boolean {
    return ADMIN_ROLE_RANK[role] >= ADMIN_ROLE_RANK[minimumRole];
}

/**
 * Parses a stored role string into a known admin role.
 *
 * @param value Raw role value
 * @returns Parsed role or null when invalid
 */
export function parseAdminRole(value: string): AdminRole | null {
    if (value === "viewer" || value === "operator" || value === "admin") {
        return value;
    }

    return null;
}
