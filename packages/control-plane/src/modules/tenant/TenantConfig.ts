/**
 * Multi-tenant feature flag and helpers.
 */
export namespace TenantConfig {
    /**
     * @returns Whether multi-tenant scoping is enabled
     */
    export function isEnabled(): boolean {
        return process.env.NAULITE_MULTI_TENANT === "true";
    }
}
