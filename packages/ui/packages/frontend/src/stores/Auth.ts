import { reactive } from "vue";
import { NauliteClient, NauliteApiError } from "@naulite/sdk";
import type { AdminRole, AdminUser, NaulitePermission } from "@naulite/sdk";
import { RolePermissions } from "@naulite/shared";
const baseUrl = import.meta.env.VITE_ADMIN_API_URL ?? "/api";

/**
 * Maps low-level browser errors to operator-friendly login messages.
 *
 * @param err Thrown error
 * @returns Message safe to show in the UI
 */
function formatAuthError(err: unknown): string {
    if (!(err instanceof Error)) {
        return String(err);
    }

    if (err.message.includes("Illegal invocation") || /failed to fetch/i.test(err.message)) {
        return "Could not reach the admin API. Check that ui-backend is running and reload the page.";
    }

    return err.message;
}

/**
 * Rebuilds the shared BFF client with an optional CSRF token.
 *
 * @param csrfToken CSRF token for mutating browser requests
 * @returns Configured platform client
 */
function createNauliteClient(csrfToken?: string): NauliteClient {
    return new NauliteClient({
        baseUrl,
        credentials: "include",
        csrfToken
    });
}

/**
 * Shared SDK client for the admin API (BFF), not the control plane directly.
 */
export let nauliteClient = createNauliteClient();

/**
 * Reactive authentication state for the admin dashboard.
 */
export const authStore = reactive({
    user: null as AdminUser | null,
    csrfToken: undefined as string | undefined,
    loading: false,
    error: "" as string,
    checked: false,

    /**
     * Loads the current session from the BFF when not already cached.
     *
     * @returns Authenticated user or null
     */
    async ensureSession(): Promise<AdminUser | null> {
        if (this.checked && !this.loading) {
            return this.user;
        }

        this.loading = true;
        this.error = "";

        try {
            const session = await nauliteClient.getSession();

            if (!session.user) {
                this.user = null;
                this.csrfToken = undefined;
                nauliteClient = createNauliteClient();
                this.checked = true;
                return null;
            }

            this.user = session.user;
            this.csrfToken = session.csrfToken;
            nauliteClient = createNauliteClient(session.csrfToken);
            this.checked = true;
            return this.user;
        } catch (err) {
            this.user = null;
            this.csrfToken = undefined;
            nauliteClient = createNauliteClient();
            this.checked = true;

            if (!(err instanceof NauliteApiError && err.status === 401)) {
                this.error = formatAuthError(err);
            }

            return null;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Authenticates with email and password through the BFF.
     *
     * @param email Operator email
     * @param password Operator password
     * @returns Authenticated user
     * @throws {unknown}
     */
    async login(email: string, password: string): Promise<AdminUser> {
        this.loading = true;
        this.error = "";

        try {
            const response = await nauliteClient.login({ email, password });
            this.user = response.user;
            this.csrfToken = response.csrfToken;
            nauliteClient = createNauliteClient(response.csrfToken);
            this.checked = true;
            return response.user;
        } catch (err) {
            this.error = formatAuthError(err);
            throw err;
        } finally {
            this.loading = false;
        }
    },

    /**
     * Clears the current browser session.
     *
     * @returns Nothing.
     */
    async logout(): Promise<void> {
        this.loading = true;
        this.error = "";

        try {
            await nauliteClient.logout();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
        } finally {
            this.user = null;
            this.csrfToken = undefined;
            nauliteClient = createNauliteClient();
            this.checked = true;
            this.loading = false;
        }
    },

    /**
     * Returns whether the current user has one of the given roles.
     *
     * @param roles Allowed roles
     * @returns True when the user role matches
     */
    hasRole(...roles: AdminRole[]): boolean {
        return Boolean(this.user && roles.includes(this.user.role));
    },

    /**
     * Returns whether the current user has a platform permission.
     *
     * @param permission Required permission
     * @returns True when the user role includes the permission
     */
    hasPermission(permission: NaulitePermission): boolean {
        if (!this.user) {
            return false;
        }

        return RolePermissions.roleHasPermission(this.user.role as AdminRole, permission);
    },

    /**
     * Returns whether the user can access viewer-level screens.
     *
     * @returns True for viewer, operator, and admin roles
     */
    canView(): boolean {
        return this.hasRole("viewer", "operator", "admin");
    },

    /**
     * Returns whether the user can run operational mutations.
     *
     * @returns True for operator and admin roles
     */
    canOperate(): boolean {
        return this.hasRole("operator", "admin");
    },

    /**
     * Returns whether the user has admin privileges.
     *
     * @returns True for admin role only
     */
    canAdmin(): boolean {
        return this.hasRole("admin");
    }
});

/**
 * Returns the shared authentication store.
 *
 * @returns Reactive auth store
 */
export function useAuthStore() {
    return authStore;
}
