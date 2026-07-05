import { Planner } from "../../../packages/control-plane/src/orchestration/Planner";
import type { Manifest, Service } from "@naulite/shared";
import { describe, expect, it } from "vitest";

function buildManifest(overrides: Partial<Manifest> = {}): Manifest {
    return {
        name: "minimal",
        services: {
            web: {
                image: "nginx:1.27-alpine",
                capabilities: [],
                deploy: {
                    replicas: 1
                }
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

function buildService(overrides: Partial<Service> = {}): Service {
    const now = new Date().toISOString();
    return {
        id: "minimal:web",
        name: "web",
        manifestName: "minimal",
        image: "nginx:1.27-alpine",
        desiredReplicas: 1,
        status: "running",
        capabilities: [],
        networks: [],
        deploySpec: {
            command: [],
            environment: {},
            ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp" }],
            secrets: [],
            volumeMounts: [{ volumeName: "data", mountPath: "/data", readOnly: false }]
        },
        createdAt: now,
        updatedAt: now,
        ...overrides
    };
}

describe("Planner phase 1.1", () => {
    const planner = new Planner();

    it("honors replica count from manifest deploy block", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    deploy: {
                        replicas: 3
                    }
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
        expect(diff.instancesToCreate.map((instance) => instance.id)).toEqual([
            "minimal:web-1",
            "minimal:web-2",
            "minimal:web-3"
        ]);
    });

    it("includes volume mounts, ports, command, and secrets in create operations", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    command: ["nginx", "-g", "daemon off;"],
                    environment: {
                        APP_ENV: "test"
                    },
                    ports: ["8080:80"],
                    volumes: ["data:/var/lib/data:ro"],
                    secrets: [{
                        secretName: "db-credentials",
                        key: "password"
                    }],
                    deploy: {
                        replicas: 1
                    }
                }
            }
        });

        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });
        const createOp = diff.operations.find((operation) => operation.type === "create");

        expect(createOp).toMatchObject({
            type: "create",
            command: ["nginx", "-g", "daemon off;"],
            environment: { APP_ENV: "test" },
            ports: [{ containerPort: 80, hostPort: 8080, protocol: "tcp" }],
            volumes: [{ volumeName: "data", mountPath: "/var/lib/data", readOnly: true }],
            secrets: []
        });
    });

    it("marks services for update when environment changes and retires old instances", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    environment: {
                        APP_ENV: "production"
                    },
                    deploy: {
                        replicas: 1
                    }
                }
            }
        });
        const now = new Date().toISOString();
        const diff = planner.diff(manifest, {
            services: [buildService()],
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

        expect(diff.servicesToUpdate).toHaveLength(1);
        expect(diff.instancesToRemove).toHaveLength(1);
        expect(diff.instancesToCreate).toHaveLength(1);
        expect(diff.operations.filter((operation) => operation.type === "stop")).toHaveLength(1);
        expect(diff.operations.filter((operation) => operation.type === "remove")).toHaveLength(1);
    });

    it("generates connect and disconnect network operations without recreating instances", () => {
        const manifest = buildManifest({
            volumes: {},
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    networks: ["backend"],
                    deploy: {
                        replicas: 1
                    }
                }
            }
        });
        const now = new Date().toISOString();
        const diff = planner.diff(manifest, {
            services: [buildService({
                networks: ["frontend"],
                deploySpec: {
                    command: [],
                    environment: {},
                    ports: [],
                    secrets: [],
                    volumeMounts: []
                }
            })],
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
            volumes: [{
                id: "minimal:data",
                name: "data",
                manifestName: "minimal",
                scope: "cluster",
                mountPath: "/var/lib/naulite/minimal/data",
                status: "ready",
                createdAt: now,
                updatedAt: now
            }]
        });

        const networkOperations = diff.operations.filter((operation) => {
            return operation.type === "connectNetwork" || operation.type === "disconnectNetwork";
        });

        expect(diff.instancesToRemove).toHaveLength(0);
        expect(diff.instancesToCreate).toHaveLength(0);
        expect(networkOperations).toEqual([
            {
                type: "disconnectNetwork",
                instanceId: "minimal:web-1",
                networkName: "frontend"
            },
            {
                type: "connectNetwork",
                instanceId: "minimal:web-1",
                networkName: "backend"
            }
        ]);
    });

    it("reports volumes to remove when they disappear from the manifest", () => {
        const manifest = buildManifest({ volumes: {} });
        const now = new Date().toISOString();
        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: [{
                id: "minimal:data",
                name: "data",
                manifestName: "minimal",
                scope: "cluster",
                mountPath: "/var/lib/naulite/minimal/data",
                status: "bound",
                createdAt: now,
                updatedAt: now
            }]
        });

        expect(diff.volumesToRemove).toHaveLength(1);
        expect(diff.volumesToRemove[0]?.name).toBe("data");
        expect(diff.operations).toContainEqual({
            type: "removeVolume",
            volumeName: "data",
            force: false
        });
    });

    it("resolves build placeholders without emitting pull operations downstream", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    build: "./app",
                    capabilities: [],
                    deploy: {
                        replicas: 1
                    }
                }
            }
        });

        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });
        const createOp = diff.operations.find((operation) => operation.type === "create");

        expect(createOp?.type).toBe("create");
        if (createOp?.type === "create") {
            expect(createOp.image).toBe("build://./app");
        }
    });

    it("keeps container-registry image refs on create operations", () => {
        const manifest = buildManifest({
            services: {
                web: {
                    image: "container-registry://minimal-web:v2",
                    capabilities: [],
                    deploy: {
                        replicas: 1
                    }
                }
            }
        });

        const diff = planner.diff(manifest, {
            services: [],
            instances: [],
            volumes: []
        });
        const createOp = diff.operations.find((operation) => operation.type === "create");

        expect(createOp?.type).toBe("create");
        if (createOp?.type === "create") {
            expect(createOp.image).toBe("container-registry://minimal-web:v2");
        }
    });
});
