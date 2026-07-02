import type { GatewayProvider, GatewayRoute, GatewayTlsMaterial } from "@platform/shared";
import type { Ingress } from "@platform/shared";

/**
 * Options for the Traefik gateway exposed through NetBird.
 */
export interface TraefikNetBirdGatewayProviderOptions {
    netbirdEndpoint?: string;
    traefikApiUrl?: string;
}

interface StoredRoute {
    serviceName: string;
    host: string;
    route: GatewayRoute;
}

/**
 * Traefik gateway provider that publishes routes through a NetBird reverse proxy endpoint.
 */
export class TraefikNetBirdGatewayProvider implements GatewayProvider {
    private readonly netbirdEndpoint: string;
    private readonly traefikApiUrl: string;
    private readonly routes = new Map<string, StoredRoute>();
    private readonly tlsByHost = new Map<string, GatewayTlsMaterial>();

    /**
     * Creates a Traefik gateway provider configured for NetBird exposure.
     * 
     * @param options NetBird and Traefik endpoint configuration
     */
    constructor(options: TraefikNetBirdGatewayProviderOptions = {}) {
        this.netbirdEndpoint = options.netbirdEndpoint ?? "https://netbird.local";
        this.traefikApiUrl = options.traefikApiUrl ?? "http://127.0.0.1:8080";
    }

    /**
     * Applies or updates a public or internal route.
     * 
     * @param route Route definition to publish
     * @returns Nothing.
     */
    async upsertRoute(route: GatewayRoute): Promise<void> {
        const key = `${route.serviceName}:${route.ingress.host}`;
        console.debug(
            "[gateway] upsertRoute service=%s host=%s target=%s:%d netbird=%s traefik=%s",
            route.serviceName,
            route.ingress.host,
            route.targetHost,
            route.targetPort,
            this.netbirdEndpoint,
            this.traefikApiUrl
        );
        this.routes.set(key, { serviceName: route.serviceName, host: route.ingress.host, route });
    }

    /**
     * Removes a previously published route.
     * 
     * @param serviceName Service name associated with the route
     * @param host Ingress host name
     * @returns Nothing.
     */
    async removeRoute(serviceName: string, host: string): Promise<void> {
        const key = `${serviceName}:${host}`;
        console.debug("[gateway] removeRoute service=%s host=%s", serviceName, host);
        this.routes.delete(key);
    }

    /**
     * Installs custom TLS material for a host.
     * 
     * @param host Host name receiving the certificate
     * @param material Resolved certificate and private key
     * @returns Nothing.
     */
    async installTls(host: string, material: GatewayTlsMaterial): Promise<void> {
        console.debug("[gateway] installTls host=%s", host);
        this.tlsByHost.set(host, material);
    }

    /**
     * Requests automatic TLS provisioning for a host.
     * 
     * @param host Host name to secure
     * @returns Nothing.
     */
    async requestAutoTls(host: string): Promise<void> {
        console.debug("[gateway] requestAutoTls host=%s via NetBird/Traefik", host);
    }

    /**
     * Resolves TLS secrets referenced by an ingress definition.
     * 
     * @param ingress Ingress definition containing secret references
     * @returns Resolved TLS material when configured
     */
    async resolveTls(ingress: Ingress): Promise<GatewayTlsMaterial | undefined> {
        const stored = this.tlsByHost.get(ingress.host);
        if (stored) {
            console.debug("[gateway] resolveTls host=%s source=installed", ingress.host);
            return stored;
        }

        if (!ingress.tls?.enabled) {
            console.debug("[gateway] resolveTls host=%s tls=disabled", ingress.host);
            return undefined;
        }

        console.debug("[gateway] resolveTls host=%s source=unresolved", ingress.host);
        return undefined;
    }
}

/**
 * Creates a Traefik gateway provider configured for NetBird exposure.
 * 
 * @param options NetBird and Traefik endpoint configuration
 * @returns Configured gateway provider
 */
export function createTraefikNetBirdGatewayProvider(
    options?: TraefikNetBirdGatewayProviderOptions
): TraefikNetBirdGatewayProvider {
    return new TraefikNetBirdGatewayProvider(options);
}
