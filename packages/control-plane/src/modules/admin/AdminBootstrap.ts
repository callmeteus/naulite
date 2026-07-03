import { AdminService } from "./AdminService";

const DEFAULT_BOOTSTRAP_USERNAME = "admin";

/**
 * Bootstraps the first admin user from environment variables or loopback requests.
 */
export namespace AdminBootstrap {
    /**
     * Seeds the first admin user from env when the table is empty.
     *
     * @returns Whether a bootstrap user was created
     */
    export async function ensureFromEnv(): Promise<boolean> {
        const password = process.env.PLATFORM_BOOTSTRAP_ADMIN_PASSWORD?.trim();

        if (!password) {
            return false;
        }

        const username = process.env.PLATFORM_BOOTSTRAP_ADMIN_USERNAME?.trim() || DEFAULT_BOOTSTRAP_USERNAME;
        const created = await AdminService.createBootstrapUser({
            username,
            password,
            role: "admin"
        });

        return created !== null;
    }
}
