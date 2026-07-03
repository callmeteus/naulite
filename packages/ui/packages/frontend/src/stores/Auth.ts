import { PlatformClient } from "@platform/sdk";
import type { AdminRole, AdminUser } from "@platform/sdk";
import { reactive } from "vue";

const baseUrl = import.meta.env.VITE_ADMIN_API_URL ?? "/api";

/**
 * Shared SDK client for the admin API (BFF), not the control plane directly.
 */
export const platformClient = new PlatformClient({
    baseUrl,
    credentials: "include"
});

/**
 * Reactive authentication state for the admin dashboard.
 */
export const authStore = reactive({
    user: null as AdminUser | null,
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
            const session = await platformClient.getSession();
            this.user = session.user;
            this.checked = true;
            return this.user;
        } catch (err) {
            this.user = null;
            this.checked = true;
            this.error = err instanceof Error ? err.message : String(err);
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
     */
    async login(email: string, password: string): Promise<AdminUser> {
        this.loading = true;
        this.error = "";

        try {
            const response = await platformClient.login({ email, password });
            this.user = response.user;
            this.checked = true;
            return response.user;
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
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
            await platformClient.logout();
        } catch (err) {
            this.error = err instanceof Error ? err.message : String(err);
        } finally {
            this.user = null;
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
