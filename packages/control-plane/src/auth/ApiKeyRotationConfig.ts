/**
 * API key rotation feature flag and timing helpers.
 */
export namespace ApiKeyRotationConfig {
    /**
     * Default grace period before the previous API key hash expires.
     */
    const DEFAULT_GRACE_SECONDS = 86_400;

    /**
     * @returns Whether API key rotation is enabled
     */
    export function isEnabled(): boolean {
        return process.env.NAULITE_API_KEY_ROTATION_ENABLED === "true";
    }

    /**
     * @returns Grace period in seconds for the previous key hash
     */
    export function gracePeriodSeconds(): number {
        const configured = Number(process.env.NAULITE_API_KEY_ROTATION_GRACE_SECONDS ?? DEFAULT_GRACE_SECONDS);

        if (!Number.isFinite(configured) || configured <= 0) {
            return DEFAULT_GRACE_SECONDS;
        }

        return configured;
    }
}
