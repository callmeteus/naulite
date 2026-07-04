/**
 * Supported TLS termination modes for the Platform gateway.
 */
export type TlsMode =
    | "acme_tls"
    | "acme_dns_cloudflare"
    | "passthrough"
    | "self_signed"
    | "custom";

const VALID_MODES = new Set<TlsMode>([
    "acme_tls",
    "acme_dns_cloudflare",
    "passthrough",
    "self_signed",
    "custom"
]);

const DEFAULT_MODE: TlsMode = "acme_tls";

/**
 * Resolves Platform TLS mode from environment variables.
 */
export namespace TlsConfig {
    /**
     * Returns the active TLS mode from `PLATFORM_TLS_MODE`.
     *
     * @returns Normalized TLS mode
     */
    export function resolveMode(): TlsMode {
        const raw = process.env.PLATFORM_TLS_MODE?.trim().toLowerCase();

        if (!raw) {
            return DEFAULT_MODE;
        }

        if (!VALID_MODES.has(raw as TlsMode)) {
            throw new Error(
                `PLATFORM_TLS_MODE "${raw}" is invalid. Expected one of: ${[...VALID_MODES].join(", ")}.`
            );
        }

        return raw as TlsMode;
    }

    /**
     * Returns whether the given TLS mode is active.
     *
     * @param mode TLS mode to compare
     * @returns Whether the mode matches the configured value
     */
    export function isEnabled(mode: TlsMode): boolean {
        return resolveMode() === mode;
    }

    /**
     * Returns whether ACME TLS-ALPN challenge mode is active.
     *
     * @returns Whether ACME TLS challenge is enabled
     */
    export function isAcmeTls(): boolean {
        return isEnabled("acme_tls");
    }

    /**
     * Returns whether ACME DNS-01 challenge with Cloudflare is active.
     *
     * @returns Whether ACME DNS Cloudflare mode is enabled
     */
    export function isAcmeDnsCloudflare(): boolean {
        return isEnabled("acme_dns_cloudflare");
    }

    /**
     * Returns whether TLS passthrough mode is active.
     *
     * @returns Whether passthrough mode is enabled
     */
    export function isPassthrough(): boolean {
        return isEnabled("passthrough");
    }

    /**
     * Returns whether self-signed default certificate mode is active.
     *
     * @returns Whether self-signed mode is enabled
     */
    export function isSelfSigned(): boolean {
        return isEnabled("self_signed");
    }

    /**
     * Returns whether custom secret-backed TLS mode is active.
     *
     * @returns Whether custom TLS mode is enabled
     */
    export function isCustom(): boolean {
        return isEnabled("custom");
    }

    /**
     * Returns whether automatic ACME certificate provisioning is supported.
     *
     * @returns Whether requestAutoTls should be used for ingress hosts
     */
    export function supportsAutoTls(): boolean {
        return isAcmeTls() || isAcmeDnsCloudflare();
    }
}
