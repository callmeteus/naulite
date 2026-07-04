import type { AdminRole, AdminUser } from "./auth-types";

/**
 * Control plane admin user shape (username-based login).
 */
export interface ControlPlaneAdminUser {
    id: string;
    username: string;
    role: AdminRole;
    tenantId?: string | null;
    createdAt: string;
    updatedAt?: string;
    disabledAt?: string | null;
}

/**
 * Maps control plane admin users to SDK admin users (email field).
 */
export namespace AdminUserMapper {
    /**
     * Normalizes a login email to the control plane username.
     *
     * @param email Admin login email
     * @returns Lowercase username stored in the control plane
     */
    export function emailToUsername(email: string): string {
        return email.trim().toLowerCase();
    }

    /**
     * Maps a control plane user record to the SDK admin user shape.
     *
     * @param user Control plane admin user
     * @returns SDK admin user with email populated from username
     */
    export function toSdkUser(user: ControlPlaneAdminUser): AdminUser {
        return {
            id: user.id,
            email: user.username,
            role: user.role,
            tenantId: user.tenantId ?? null,
            createdAt: user.createdAt,
            disabledAt: user.disabledAt ?? null
        };
    }
}
