import type { Ingress } from "../types/Ingress";

/**
 * Route definition consumed by the gateway provider.
 */
export interface GatewayRoute {
    serviceName: string;
    ingress: Ingress;
    targetHost: string;
    targetPort: number;
}

/**
 * TLS material resolved from cluster secrets.
 */
export interface GatewayTlsMaterial {
    certificate: string;
    privateKey: string;
}

/**
 * Gateway provider contract for Traefik and future ingress backends.
 */
export interface GatewayProvider {
    /**
     * Applies or updates a public or internal route.
     * 
     * @param route Route definition to publish
     * @returns Nothing.
     */
    upsertRoute(route: GatewayRoute): Promise<void>;

    /**
     * Removes a previously published route.
     * 
     * @param serviceName Service name associated with the route
     * @param host Ingress host name
     * @returns Nothing.
     */
    removeRoute(serviceName: string, host: string): Promise<void>;

    /**
     * Installs custom TLS material for a host.
     * 
     * @param host Host name receiving the certificate
     * @param material Resolved certificate and private key
     * @returns Nothing.
     */
    installTls(host: string, material: GatewayTlsMaterial): Promise<void>;

    /**
     * Requests automatic TLS provisioning for a host.
     * 
     * @param host Host name to secure
     * @returns Nothing.
     */
    requestAutoTls(host: string): Promise<void>;

    /**
     * Resolves TLS secrets referenced by an ingress definition.
     * 
     * @param ingress Ingress definition containing secret references
     * @returns Resolved TLS material when configured
     */
    resolveTls(ingress: Ingress): Promise<GatewayTlsMaterial | undefined>;
}
