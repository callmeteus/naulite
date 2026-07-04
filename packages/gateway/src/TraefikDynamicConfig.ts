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
        passthrough?: boolean;
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
    certFile?: string;
    keyFile?: string;
    cert?: string;
    key?: string;
    stores?: string[];
}

/**
 * Options that control how TLS is rendered in Traefik dynamic configuration.
 */
export interface TraefikTlsBuildOptions {
    mode?: string;
    certResolver?: string;
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
     * @param options TLS rendering options derived from PLATFORM_TLS_MODE
     * @returns Traefik dynamic configuration payload
     */
    export function build(
        routes: Map<string, StoredRoute>,
        tlsByHost: Map<string, StoredTls>,
        netbirdEndpoint: string,
        autoTlsHosts: Set<string>,
        options: TraefikTlsBuildOptions = {}
    ): TraefikDynamicConfiguration {
        const mode = options.mode ?? "acme_tls";
        const certResolver = options.certResolver ?? "letsencrypt";
        const useAcme = mode === "acme_tls" || mode === "acme_dns_cloudflare";
        const usePassthrough = mode === "passthrough";
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

            const hasInlineTls = tlsByHost.has(route.ingress.host);
            const wantsTls = route.ingress.tls?.enabled !== false;

            if (usePassthrough && wantsTls) {
                router.tls = { passthrough: true };
            } else if (hasInlineTls) {
                router.tls = {};
            } else if (useAcme && (autoTlsHosts.has(route.ingress.host) || route.ingress.tls?.enabled)) {
                router.tls = { certResolver };
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
            cert: entry.certificate,
            key: entry.privateKey,
            stores: ["default"]
        }));

        if (certificates.length > 0) {
            configuration.tls = { certificates };
        }

        return configuration;
    }
}
