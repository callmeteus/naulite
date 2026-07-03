import type { GatewayProvider, GatewayRoute, GatewayTlsMaterial, Ingress } from "@platform/shared";

import { TraefikDynamicConfig } from "./TraefikDynamicConfig";

/**
 * Options for the Traefik gateway exposed through NetBird.
 */
export interface TraefikNetBirdGatewayProviderOptions {
    netbirdEndpoint?: string;
    traefikApiUrl?: string;
    traefikDynamicConfigUrl?: string;
    fetchImpl?: typeof fetch;
}

interface StoredRoute {
    serviceName: string;
    host: string;
    route: GatewayRoute;
}

interface StoredTls {
    host: string;
    certificate: string;
    privateKey: string;
}

/**
 * Traefik gateway provider that publishes routes through a NetBird reverse proxy endpoint.
 */
export class TraefikNetBirdGatewayProvider implements GatewayProvider {
    private readonly netbirdEndpoint: string;
    private readonly traefikApiUrl: string;
    private readonly traefikDynamicConfigUrl: string;
    private readonly fetchImpl: typeof fetch;
    private readonly routes = new Map<string, StoredRoute>();
    private readonly tlsByHost = new Map<string, StoredTls>();
    private readonly autoTlsHosts = new Set<string>();

    /**
     * Creates a Traefik gateway provider configured for NetBird exposure.
     *
     * @param options NetBird and Traefik endpoint configuration
     */
    constructor(options: TraefikNetBirdGatewayProviderOptions = {}) {
        this.netbirdEndpoint = options.netbirdEndpoint ?? "https://netbird.local";
        this.traefikApiUrl = options.traefikApiUrl ?? "http://127.0.0.1:8080";
        this.traefikDynamicConfigUrl = options.traefikDynamicConfigUrl
            ?? `${this.traefikApiUrl.replace(/\/+$/, "")}/platform/dynamic-config`;
        this.fetchImpl = options.fetchImpl ?? fetch;
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
        await this.pushDynamicConfig();
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
        await this.pushDynamicConfig();
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
        this.tlsByHost.set(host, {
            host,
            certificate: material.certificate,
            privateKey: material.privateKey
        });
        await this.pushDynamicConfig();
    }

    /**
     * Requests automatic TLS provisioning for a host.
     *
     * @param host Host name to secure
     * @returns Nothing.
     */
    async requestAutoTls(host: string): Promise<void> {
        console.debug("[gateway] requestAutoTls host=%s via NetBird/Traefik", host);
        this.autoTlsHosts.add(host);
        await this.pushDynamicConfig();
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
            return {
                certificate: stored.certificate,
                privateKey: stored.privateKey
            };
        }

        if (!ingress.tls?.enabled) {
            console.debug("[gateway] resolveTls host=%s tls=disabled", ingress.host);
            return undefined;
        }

        console.debug("[gateway] resolveTls host=%s source=unresolved", ingress.host);
        return undefined;
    }

    /**
     * Returns the current in-memory route table for tests and diagnostics.
     *
     * @returns Stored routes keyed by service and host
     */
    listRoutes(): StoredRoute[] {
        return [...this.routes.values()];
    }

    /**
     * Replaces the in-memory route table and pushes Traefik dynamic configuration.
     *
     * @param routes Gateway routes to publish
     * @returns Nothing.
     */
    async syncRoutes(routes: GatewayRoute[]): Promise<void> {
        const nextKeys = new Set<string>();

        for (const route of routes) {
            const key = `${route.serviceName}:${route.ingress.host}`;
            nextKeys.add(key);
            this.routes.set(key, {
                serviceName: route.serviceName,
                host: route.ingress.host,
                route
            });
        }

        for (const key of [...this.routes.keys()]) {
            if (!nextKeys.has(key)) {
                this.routes.delete(key);
            }
        }

        await this.pushDynamicConfig();
    }

    /**
     * Pushes the current dynamic configuration to Traefik.
     *
     * @returns Nothing.
     */
    private async pushDynamicConfig(): Promise<void> {
        const configuration = TraefikDynamicConfig.build(
            this.routes,
            this.tlsByHost,
            this.netbirdEndpoint,
            this.autoTlsHosts
        );

        console.debug(
            "[gateway] pushDynamicConfig routers=%d services=%d middlewares=%d url=%s",
            Object.keys(configuration.http.routers).length,
            Object.keys(configuration.http.services).length,
            Object.keys(configuration.http.middlewares).length,
            this.traefikDynamicConfigUrl
        );

        const response = await this.fetchImpl(this.traefikDynamicConfigUrl, {
            method: "PUT",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify(configuration)
        });

        if (!response.ok) {
            console.debug(
                "[gateway] pushDynamicConfig failed status=%d url=%s",
                response.status,
                this.traefikDynamicConfigUrl
            );
            throw new Error(`Traefik dynamic configuration push failed with status ${response.status}.`);
        }
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
