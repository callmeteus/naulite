import { AdminStore } from "./AdminStore";

let store: AdminStore | undefined;

/**
 * Returns the shared admin store instance.
 *
 * @returns Admin store singleton
 */
export function getAdminStore(): AdminStore {
    if (!store) {
        store = new AdminStore();
    }

    return store;
}

/**
 * Admin authentication and user management service.
 */
export namespace AdminService {
    /**
     * @returns Number of admin users
     */
    export function countUsers(): ReturnType<AdminStore["countUsers"]> {
        return getAdminStore().countUsers();
    }

    /**
     * @param username Login username
     * @param password Plaintext password
     * @returns Login result when credentials are valid
     */
    export function login(username: string, password: string): ReturnType<AdminStore["login"]> {
        return getAdminStore().login(username, password);
    }

    /**
     * @param sessionToken Plaintext session token
     * @returns Public user when the session is active
     */
    export function resolveSession(sessionToken: string): ReturnType<AdminStore["resolveSession"]> {
        return getAdminStore().resolveSession(sessionToken);
    }

    /**
     * @param sessionToken Plaintext session token
     * @returns Whether a session was revoked
     */
    export function logout(sessionToken: string): ReturnType<AdminStore["logout"]> {
        return getAdminStore().logout(sessionToken);
    }

    /**
     * @param input Bootstrap user payload
     * @returns Created public user or null when users already exist
     */
    export function createBootstrapUser(
        input: Parameters<AdminStore["createBootstrapUser"]>[0]
    ): ReturnType<AdminStore["createBootstrapUser"]> {
        return getAdminStore().createBootstrapUser(input);
    }
}
