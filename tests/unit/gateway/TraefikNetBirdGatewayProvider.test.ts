import { describe, expect, it, vi } from "vitest";

import { TraefikDynamicConfig, TraefikNetBirdGatewayProvider } from "@naulite/gateway";

describe("TraefikDynamicConfig", () => {
    it("builds router and service definitions for a public route", () => {
        const routes = new Map([
            ["web:app.example.com", {
                serviceName: "web",
                host: "app.example.com",
                route: {
                    serviceName: "web",
                    ingress: {
                        host: "app.example.com",
                        exposure: "public" as const,
                        paths: [{ path: "/", port: 8080, protocol: "http" as const }]
                    },
                    targetHost: "agent-1",
                    targetPort: 8080
                }
            }]
        ]);

        const configuration = TraefikDynamicConfig.build(
            routes,
            new Map(),
            "https://vpn.example.com",
            new Set(["app.example.com"])
        );

        expect(Object.keys(configuration.http.routers)).toEqual(["naulite-web-app-example-com"]);
        expect(configuration.http.routers["naulite-web-app-example-com"]).toEqual({
            rule: "Host(`app.example.com`)",
            service: "naulite-web-app-example-com-svc",
            entryPoints: ["web", "websecure"],
            middlewares: ["naulite-netbird-app-example-com"],
            tls: { certResolver: "letsencrypt" }
        });
        expect(configuration.http.services["naulite-web-app-example-com-svc"]).toEqual({
            loadBalancer: {
                servers: [{ url: "http://agent-1:8080" }]
            }
        });
    });

    it("embeds inline TLS certificates using cert and key fields", () => {
        const routes = new Map([
            ["api:api.example.com", {
                serviceName: "api",
                host: "api.example.com",
                route: {
                    serviceName: "api",
                    ingress: {
                        host: "api.example.com",
                        exposure: "public" as const,
                        tls: { enabled: true },
                        paths: [{ path: "/", port: 443, protocol: "https" as const }]
                    },
                    targetHost: "agent-1",
                    targetPort: 443
                }
            }]
        ]);
        const tlsByHost = new Map([
            ["api.example.com", {
                host: "api.example.com",
                certificate: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----",
                privateKey: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----"
            }]
        ]);

        const configuration = TraefikDynamicConfig.build(
            routes,
            tlsByHost,
            "https://vpn.example.com",
            new Set(),
            { mode: "custom" }
        );

        expect(configuration.http.routers["naulite-api-api-example-com"].tls).toEqual({});
        expect(configuration.tls?.certificates).toEqual([{
            cert: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----",
            key: "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----",
            stores: ["default"]
        }]);
    });

    it("uses TLS passthrough routers when mode is passthrough", () => {
        const routes = new Map([
            ["api:api.example.com", {
                serviceName: "api",
                host: "api.example.com",
                route: {
                    serviceName: "api",
                    ingress: {
                        host: "api.example.com",
                        exposure: "public" as const,
                        tls: { enabled: true },
                        paths: [{ path: "/", port: 443, protocol: "https" as const }]
                    },
                    targetHost: "agent-1",
                    targetPort: 443
                }
            }]
        ]);

        const configuration = TraefikDynamicConfig.build(
            routes,
            new Map(),
            "https://vpn.example.com",
            new Set(),
            { mode: "passthrough" }
        );

        expect(configuration.http.routers["naulite-api-api-example-com"].tls).toEqual({
            passthrough: true
        });
        expect(configuration.tls).toBeUndefined();
    });

    it("enables TLS routers in self_signed mode when ingress TLS is enabled", () => {
        const routes = new Map([
            ["web:web-tls.test.local", {
                serviceName: "web",
                host: "web-tls.test.local",
                route: {
                    serviceName: "web",
                    ingress: {
                        host: "web-tls.test.local",
                        exposure: "public" as const,
                        tls: { enabled: true },
                        paths: [{ path: "/", port: 80, protocol: "http" as const }]
                    },
                    targetHost: "agent-1",
                    targetPort: 80
                }
            }]
        ]);

        const configuration = TraefikDynamicConfig.build(
            routes,
            new Map(),
            "https://vpn.example.com",
            new Set(),
            { mode: "self_signed" }
        );

        expect(configuration.http.routers["naulite-web-web-tls-test-local"].tls).toEqual({});
        expect(configuration.tls).toBeUndefined();
    });
});

describe("TraefikNetBirdGatewayProvider", () => {
    it("pushes dynamic configuration when a route is upserted", async () => {
        const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
        const provider = new TraefikNetBirdGatewayProvider({
            netbirdEndpoint: "https://vpn.example.com",
            traefikApiUrl: "http://traefik:8080",
            traefikDynamicConfigUrl: "http://traefik:8080/naulite/dynamic-config",
            fetchImpl
        });

        await provider.upsertRoute({
            serviceName: "api",
            ingress: {
                host: "api.example.com",
                exposure: "public",
                paths: [{ path: "/", port: 3000, protocol: "http" }]
            },
            targetHost: "node-a",
            targetPort: 3000
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledWith(
            "http://traefik:8080/naulite/dynamic-config",
            expect.objectContaining({ method: "PUT" })
        );

        const requestInit = fetchImpl.mock.calls[0]?.[1] as RequestInit;
        const body = JSON.parse(String(requestInit.body)) as {
            http: { routers: Record<string, unknown> };
        };
        expect(Object.keys(body.http.routers)).toContain("naulite-api-api-example-com");
        expect(provider.listRoutes()).toHaveLength(1);
    });

    it("removes routes from the pushed dynamic configuration", async () => {
        const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
        const provider = new TraefikNetBirdGatewayProvider({
            traefikDynamicConfigUrl: "http://traefik:8080/naulite/dynamic-config",
            fetchImpl
        });

        await provider.upsertRoute({
            serviceName: "api",
            ingress: {
                host: "api.example.com",
                exposure: "public",
                paths: [{ path: "/", port: 3000, protocol: "http" }]
            },
            targetHost: "node-a",
            targetPort: 3000
        });
        await provider.removeRoute("api", "api.example.com");

        expect(fetchImpl).toHaveBeenCalledTimes(2);
        expect(provider.listRoutes()).toHaveLength(0);
    });

    it("throws when Traefik rejects the dynamic configuration push", async () => {
        const fetchImpl = vi.fn(async () => new Response("failed", { status: 500 }));
        const provider = new TraefikNetBirdGatewayProvider({
            traefikDynamicConfigUrl: "http://traefik:8080/naulite/dynamic-config",
            fetchImpl
        });

        await expect(provider.upsertRoute({
            serviceName: "api",
            ingress: {
                host: "api.example.com",
                exposure: "public",
                paths: [{ path: "/", port: 3000, protocol: "http" }]
            },
            targetHost: "node-a",
            targetPort: 3000
        })).rejects.toThrow("Traefik dynamic configuration push failed");
    });
});
