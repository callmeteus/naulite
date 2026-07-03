import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { BuildService } from "../../../packages/control-plane/src/services/BuildService";
import { LocalSecretProvider } from "../../../packages/control-plane/src/modules/secrets/LocalSecretProvider";
import { ApplyService } from "../../../packages/control-plane/src/services/ApplyService";
import { ClusterStateService } from "../../../packages/control-plane/src/services/ClusterStateService";

function createNetBirdApplyContext(): ControlPlaneContext {
    const ensureInternalGroup = vi.fn(async (name: string) => ({
        id: `group-${name}`,
        name,
        peers: []
    }));
    const ensureGroupAccessPolicy = vi.fn(async () => ({
        id: "acl-1",
        name: "policy",
        sourceGroups: ["group-a"],
        destinationGroups: ["group-a"],
        ports: [8080],
        protocol: "tcp" as const
    }));
    const syncPlatformNodePeers = vi.fn(async () => ({
        id: "group-platform-nodes",
        name: "platform-nodes",
        peers: ["peer-1"]
    }));
    const upsertRoute = vi.fn(async () => undefined);
    const requestAutoTls = vi.fn(async () => undefined);

    return {
        store: {
            listServices: vi.fn(async () => []),
            listInstances: vi.fn(async () => []),
            listVolumes: vi.fn(async () => []),
            listNodes: vi.fn(async () => [{
                id: "agent-1",
                hostname: "agent-1",
                status: "online",
                labels: {},
                capabilities: ["docker"],
                resources: {
                    cpuMillisTotal: 4000,
                    cpuMillisUsed: 0,
                    memoryMbTotal: 8192,
                    memoryMbUsed: 0,
                    diskMbTotal: 102400,
                    diskMbUsed: 0
                },
                agentVersion: "zig-0.1.0",
                agentUrl: "http://agent-1:9470",
                netbirdDeviceId: "peer-1",
                lastHeartbeatAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }]),
            upsertService: vi.fn(async () => undefined),
            insertInstance: vi.fn(async () => undefined),
            insertVolume: vi.fn(async () => undefined),
            deleteInstance: vi.fn(async () => undefined),
            deleteService: vi.fn(async () => undefined),
            deleteVolumeByName: vi.fn(async () => true)
        },
        composeParser: {
            parse: vi.fn(() => ({
                name: "demo",
                services: {
                    api: {
                        image: "api:latest",
                        networks: ["internal"],
                        capabilities: [],
                        ingress: {
                            host: "api.internal",
                            exposure: "internal",
                            paths: [{ path: "/", port: 8080, protocol: "http" }]
                        }
                    },
                    web: {
                        image: "nginx:alpine",
                        capabilities: [],
                        ingress: {
                            host: "app.example.com",
                            exposure: "public",
                            tls: { enabled: true },
                            paths: [{ path: "/", port: 80, protocol: "http" }]
                        }
                    }
                },
                volumes: {},
                networks: {
                    internal: {
                        name: "internal",
                        local: false,
                        driver: "bridge"
                    }
                },
                registries: {}
            })),
            extractInternalExposures: vi.fn(() => [{
                serviceName: "api",
                port: 8080,
                protocol: "tcp",
                networkName: "internal"
            }])
        },
        planner: {
            diff: vi.fn(() => ({
                servicesToCreate: [],
                servicesToUpdate: [],
                servicesToRemove: [],
                instancesToCreate: [],
                instancesToRemove: [],
                volumesToEnsure: [],
                volumesToRemove: [],
                operations: []
            })),
            buildExecutionPlan: vi.fn((manifestName, nodeId, revision, operations) => ({
                planId: `${manifestName}-${nodeId}-${revision}`,
                revision,
                nodeId,
                manifestName,
                operations,
                createdAt: new Date().toISOString()
            }))
        },
        scheduler: {
            schedule: vi.fn()
        },
        exposurePlanner: {
            plan: vi.fn(() => ({
                manifestName: "demo",
                entries: [{
                    networkGroupId: "demo-internal",
                    exposure: {
                        serviceName: "api",
                        port: 8080,
                        protocol: "tcp",
                        networkName: "internal"
                    },
                    netbirdGroupName: "internal-demo-internal"
                }]
            }))
        },
        secretProvider: new LocalSecretProvider({ masterKey: "test-master-key-material" }),
        netBirdService: {
            ensureInternalGroup,
            ensureGroupAccessPolicy,
            syncPlatformNodePeers
        },
        gatewayProvider: {
            upsertRoute,
            requestAutoTls
        },
        controlPlaneSync: {
            publish: vi.fn(async () => null)
        },
        applyRevision: 0
    } as unknown as ControlPlaneContext;
}

function installNetBirdApplyContext(context: ControlPlaneContext): void {
    ControlPlaneService.install(context);
    vi.spyOn(ClusterStateService, "saveApplyRevision").mockResolvedValue(undefined);
    vi.spyOn(ControlPlaneService.GitOps, "recordRevision").mockResolvedValue({
        id: "rev-1",
        repositoryUrl: "inline://apply",
        branch: "main",
        commitSha: "rev-1",
        overlayPaths: [],
        manifestYaml: "",
        manifestName: "demo",
        createdAt: new Date().toISOString()
    });
    vi.spyOn(ControlPlaneService.Apply, "incrementRevision").mockImplementation(async () => {
        context.applyRevision += 1;
        return context.applyRevision;
    });
    vi.spyOn(ControlPlaneService.Apply, "getRevision").mockImplementation(() => context.applyRevision);
    vi.spyOn(BuildService, "resolveBuildOperations").mockImplementation(async (_context, _manifest, operations) => {
        return operations;
    });
}

describe("ApplyService NetBird and gateway provisioning", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("ensures network groups, exposure ACLs, and public ingress routes during apply", async () => {
        const context = createNetBirdApplyContext();
        installNetBirdApplyContext(context);

        await ApplyService.execute("name: demo");

        expect(context.netBirdService.ensureInternalGroup).toHaveBeenCalledWith("demo-internal");
        expect(context.netBirdService.ensureInternalGroup).toHaveBeenCalledWith("internal-demo-internal");
        expect(context.netBirdService.ensureGroupAccessPolicy).toHaveBeenCalledWith(
            "group-demo-internal",
            "platform-network-demo-internal",
            []
        );
        expect(context.netBirdService.ensureGroupAccessPolicy).toHaveBeenCalledWith(
            "group-internal-demo-internal",
            "platform-exposure-internal-demo-internal",
            ["8080"]
        );
        expect(context.netBirdService.syncPlatformNodePeers).toHaveBeenCalledWith(["peer-1"]);
        expect(context.gatewayProvider.upsertRoute).toHaveBeenCalledWith(expect.objectContaining({
            serviceName: "web",
            targetHost: "agent-1",
            targetPort: 80
        }));
        expect(context.gatewayProvider.requestAutoTls).toHaveBeenCalledWith("app.example.com");
    });
});
