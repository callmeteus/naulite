import type { GatewayRoute } from "@platform/shared";

/**
 * Traefik dynamic configuration payload pushed to the HTTP provider endpoint.
 */
export interface TraefikDynamicConfiguration {
    http: {
        routers: Record<string, TraefikRouterDefinition>;
        services: Record<string, TraefikServiceDefinition>;
        middlewares: Record<string, TraefikMiddlewareDefinition>;
    };
    tls?: {
        certificates: TraefikTlsCertificate[];
    };
}

interface TraefikRouterDefinition {
    rule: string;
    service: string;
    entryPoints: string[];
    middlewares?: string[];
    tls?: {
        certResolver?: string;
    };
}

interface TraefikServiceDefinition {
    loadBalancer: {
        servers: Array<{ url: string }>;
    };
}

interface TraefikMiddlewareDefinition {
    headers?: {
        customRequestHeaders?: Record<string, string>;
    };
}

interface TraefikTlsCertificate {
    certFile: string;
    keyFile: string;
    stores?: string[];
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
 * Builds Traefik dynamic configuration from stored gateway routes.
 */
export namespace TraefikDynamicConfig {
    /**
     * Sanitizes a host name into a Traefik resource key segment.
     *
     * @param value Raw host or service identifier
     * @returns Traefik-safe resource key
     */
    export function sanitizeKey(value: string): string {
        return value.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    }

    /**
     * Builds the router name for a gateway route.
     *
     * @param route Gateway route definition
     * @returns Traefik router resource name
     */
    export function routerName(route: GatewayRoute): string {
        return `platform-${sanitizeKey(route.serviceName)}-${sanitizeKey(route.ingress.host)}`;
    }

    /**
     * Builds the service name for a gateway route.
     *
     * @param route Gateway route definition
     * @returns Traefik service resource name
     */
    export function serviceName(route: GatewayRoute): string {
        return `${routerName(route)}-svc`;
    }

    /**
     * Builds the NetBird reverse-proxy middleware name for a host.
     *
     * @param host Ingress host name
     * @returns Traefik middleware resource name
     */
    export function netbirdMiddlewareName(host: string): string {
        return `platform-netbird-${sanitizeKey(host)}`;
    }

    /**
     * Builds a Traefik dynamic configuration document from route and TLS state.
     *
     * @param routes Stored gateway routes keyed by service and host
     * @param tlsByHost Installed TLS material keyed by host
     * @param netbirdEndpoint Public NetBird reverse-proxy endpoint
     * @param autoTlsHosts Hosts that should request automatic TLS
     * @returns Traefik dynamic configuration payload
     */
    export function build(
        routes: Map<string, StoredRoute>,
        tlsByHost: Map<string, StoredTls>,
        netbirdEndpoint: string,
        autoTlsHosts: Set<string>
    ): TraefikDynamicConfiguration {
        const routers: Record<string, TraefikRouterDefinition> = {};
        const services: Record<string, TraefikServiceDefinition> = {};
        const middlewares: Record<string, TraefikMiddlewareDefinition> = {};

        for (const stored of routes.values()) {
            const route = stored.route;
            const routerKey = routerName(route);
            const serviceKey = serviceName(route);
            const middlewareKey = netbirdMiddlewareName(route.ingress.host);
            const targetScheme = route.ingress.paths[0]?.protocol === "https" ? "https" : "http";

            middlewares[middlewareKey] = {
                headers: {
                    customRequestHeaders: {
                        "X-Forwarded-Host": route.ingress.host,
                        "X-Platform-Netbird-Endpoint": netbirdEndpoint
                    }
                }
            };

            services[serviceKey] = {
                loadBalancer: {
                    servers: [{
                        url: `${targetScheme}://${route.targetHost}:${route.targetPort}`
                    }]
                }
            };

            const router: TraefikRouterDefinition = {
                rule: `Host(\`${route.ingress.host}\`)`,
                service: serviceKey,
                entryPoints: ["web", "websecure"],
                middlewares: [middlewareKey]
            };

            if (autoTlsHosts.has(route.ingress.host) || route.ingress.tls?.enabled) {
                router.tls = { certResolver: "letsencrypt" };
            }

            routers[routerKey] = router;
        }

        const configuration: TraefikDynamicConfiguration = {
            http: {
                routers,
                services,
                middlewares
            }
        };

        const certificates = [...tlsByHost.values()].map((entry) => ({
            certFile: entry.certificate,
            keyFile: entry.privateKey,
            stores: ["default"]
        }));

        if (certificates.length > 0) {
            configuration.tls = { certificates };
        }

        return configuration;
    }
}
