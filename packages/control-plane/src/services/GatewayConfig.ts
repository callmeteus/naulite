/**
 * Resolves gateway provider configuration from environment variables.
 */
export namespace GatewayConfig {
    /**
     * Resolves the Traefik API and dynamic configuration base URL.
     *
     * @returns Normalized Traefik base URL without trailing slash
     */
    export function resolveTraefikApiUrl(): string {
        const raw = process.env.TRAEFIK_API_URL
            ?? process.env.TRAEFIK_DYNAMIC_CONFIG_URL
            ?? "http://127.0.0.1:8080";

        return raw.trim().replace(/\/+$/, "");
    }

    /**
     * Resolves the endpoint used to push Traefik dynamic configuration.
     *
     * @returns URL that accepts PUT with Traefik dynamic configuration JSON
     */
    export function resolveTraefikDynamicConfigUrl(): string {
        const configured = process.env.TRAEFIK_DYNAMIC_CONFIG_URL?.trim();

        if (configured) {
            return configured.replace(/\/+$/, "");
        }

        return `${resolveTraefikApiUrl()}/platform/dynamic-config`;
    }

    /**
     * Resolves the public NetBird reverse-proxy endpoint for ingress routes.
     *
     * @returns NetBird endpoint exposed to gateway clients
     */
    export function resolveNetbirdEndpoint(): string {
        const raw = process.env.NETBIRD_PUBLIC_MANAGEMENT_URL
            ?? process.env.NETBIRD_MANAGEMENT_URL
            ?? "https://netbird.local";

        return raw.trim().replace(/\/+$/, "");
    }
}
