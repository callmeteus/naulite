/**
 * Admin panel role assigned to an operator account.
 */
export type AdminRole = "viewer" | "operator" | "admin";

/**
 * Admin user record returned by session and user management APIs.
 */
export interface AdminUser {
    id: string;
    email: string;
    role: AdminRole;
    tenantId?: string | null;
    createdAt: string;
    disabledAt?: string | null;
}

/**
 * Credentials payload for admin login.
 */
export interface AdminLoginInput {
    email: string;
    password: string;
}

/**
 * Successful admin login response from the control plane.
 */
export interface AdminLoginResponse {
    sessionToken: string;
    user: AdminUser;
}

/**
 * Current session payload returned by GET /auth/me.
 */
export interface AdminSession {
    user: AdminUser;
}

/**
 * Admin BFF login response including CSRF token for browser mutations.
 */
export interface BffLoginResponse {
    user: AdminUser;
    csrfToken: string;
}

/**
 * Admin BFF session response including CSRF token when authenticated.
 */
export interface BffSessionResponse {
    user: AdminUser | null;
    csrfToken?: string;
}

/**
 * Payload for creating a new admin user.
 */
export interface CreateAdminUserInput {
    email: string;
    password: string;
    role: AdminRole;
}

/**
 * Payload for disabling an admin user.
 */
export interface DisableAdminUserInput {
    reason?: string;
}

/**
 * Payload for updating an admin user.
 */
export interface UpdateAdminUserInput {
    email?: string;
    role?: AdminRole;
    password?: string;
}
