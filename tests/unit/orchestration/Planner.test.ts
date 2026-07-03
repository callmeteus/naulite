import { Planner } from "@platform/control-plane";
import type { Manifest } from "@platform/shared";
import { describe, expect, it } from "vitest";

function buildManifest(overrides: Partial<Manifest> = {}): Manifest {
    return {
        name: "minimal",
        services: {
            web: {
                image: "nginx:1.27-alpine",
                capabilities: []
            }
        },
        volumes: {
            data: {
                driver: "local"
            }
        },
        networks: {},
        registries: {},
        ...overrides
    };
}

describe("Planner", () => {
    const planner = new Planner();

    it("creates services, instances, volumes, and operations for a new manifest", () => {
        const manifest = buildManifest();
        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });

        expect(diff.servicesToCreate).toHaveLength(1);
        expect(diff.servicesToCreate[0]?.name).toBe("web");
        expect(diff.servicesToCreate[0]?.image).toBe("nginx:1.27-alpine");
        expect(diff.instancesToCreate).toHaveLength(1);
        expect(diff.volumesToEnsure).toHaveLength(1);
        expect(diff.volumesToEnsure[0]?.name).toBe("data");
        expect(diff.operations.some((operation) => operation.type === "create")).toBe(true);
        expect(diff.operations.some((operation) => operation.type === "start")).toBe(true);
        expect(diff.operations.some((operation) => operation.type === "ensureVolume")).toBe(true);
    });

    it("creates multiple instances when deploy.replicas is greater than one", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    deploy: { replicas: 3 }
                }
            }
        });
        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });

        expect(diff.servicesToCreate[0]?.desiredReplicas).toBe(3);
        expect(diff.instancesToCreate).toHaveLength(3);
    });

    it("includes connectNetwork operations for declared service networks", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    networks: ["backend"]
                }
            }
        });
        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });

        expect(diff.operations.some((operation) => operation.type === "connectNetwork")).toBe(true);
    });

    it("uses build placeholders for services that declare build blocks", () => {
        const manifest = buildManifest({
            services: {
                api: {
                    build: "./api",
                    capabilities: []
                }
            },
            volumes: {}
        });
        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });

        expect(diff.servicesToCreate[0]?.image).toBe("build://./api");
    });

    it("removes services and instances that are no longer in the manifest", () => {
        const manifest = buildManifest({ services: {}, volumes: {} });
        const now = new Date().toISOString();
        const diff = planner.diff(manifest, {
            services: [{
                id: "minimal:web",
                name: "web",
                manifestName: "minimal",
                image: "nginx:1.27-alpine",
                desiredReplicas: 1,
                status: "running",
                capabilities: [],
                networks: [],
                createdAt: now,
                updatedAt: now
            }],
            instances: [{
                id: "minimal:web-1",
                serviceId: "minimal:web",
                serviceName: "web",
                nodeId: "node-a",
                status: "running",
                image: "nginx:1.27-alpine",
                createdAt: now,
                updatedAt: now
            }],
            volumes: []
        });

        expect(diff.servicesToRemove).toHaveLength(1);
        expect(diff.instancesToRemove).toHaveLength(1);
        expect(diff.operations.filter((operation) => operation.type === "stop")).toHaveLength(1);
        expect(diff.operations.filter((operation) => operation.type === "remove")).toHaveLength(1);
    });
});
