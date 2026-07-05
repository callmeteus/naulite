import type { ExecutionOperation } from "@naulite/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ControlPlaneService } from "../../../packages/control-plane/src/ControlPlaneService";
import type { ControlPlaneContext } from "../../../packages/control-plane/src/ControlPlaneContext";
import { BuildService } from "../../../packages/control-plane/src/services/BuildService";
import { LocalSecretProvider } from "../../../packages/control-plane/src/modules/secrets/LocalSecretProvider";
import { ApplyService } from "../../../packages/control-plane/src/services/ApplyService";
import { PipelineRunService } from "../../../packages/control-plane/src/services/PipelineRunService";

import { ClusterStateService } from "../../../packages/control-plane/src/services/ClusterStateService";

function createApplyTestContext(): ControlPlaneContext {
    const secretProvider = new LocalSecretProvider({
        masterKey: "test-master-key-material"
    });

    return {
        store: {
            listServices: vi.fn(async () => []),
            listInstances: vi.fn(async () => []),
            listVolumes: vi.fn(async () => []),
            listNodes: vi.fn(async () => [{
                id: "agent-1",
                hostname: "agent-1.local",
                status: "online",
                labels: {},
                capabilities: [],
                resources: {
                    cpuMillisTotal: 4000,
                    cpuMillisUsed: 100,
                    memoryMbTotal: 8192,
                    memoryMbUsed: 256,
                    diskMbTotal: 102400,
                    diskMbUsed: 1024
                },
                agentVersion: "0.1.0",
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
                name: "minimal",
                services: {
                    web: {
                        image: "nginx:1.27-alpine",
                        capabilities: [],
                        secrets: [],
                        deploy: {
                            replicas: 1
                        }
                    }
                },
                volumes: {},
                networks: {},
                registries: {}
            })),
            extractInternalExposures: vi.fn(() => [])
        },
        planner: {
            diff: vi.fn(() => ({
                servicesToCreate: [{
                    id: "minimal:web",
                    name: "web",
                    manifestName: "minimal",
                    image: "nginx:1.27-alpine",
                    desiredReplicas: 1,
                    status: "pending",
                    capabilities: [],
                    networks: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }],
                servicesToUpdate: [],
                servicesToRemove: [],
                instancesToCreate: [{
                    id: "minimal:web-1",
                    serviceId: "minimal:web",
                    serviceName: "web",
                    nodeId: "unscheduled",
                    status: "pending",
                    image: "nginx:1.27-alpine",
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }],
                instancesToRemove: [],
                volumesToEnsure: [],
                volumesToRemove: [],
                operations: [{
                    type: "create",
                    instanceId: "minimal:web-1",
                    serviceName: "web",
                    image: "nginx:1.27-alpine",
                    command: [],
                    environment: {},
                    volumes: [],
                    networks: [],
                    ports: [],
                    secrets: []
                }, {
                    type: "start",
                    instanceId: "minimal:web-1"
                }]
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
            schedule: vi.fn(() => ({
                service: { id: "minimal:web", name: "web" },
                node: { id: "agent-1" },
                score: { score: 1, matchedLabels: [], matchedCapabilities: [], node: { id: "agent-1" } }
            }))
        },
        exposurePlanner: {
            plan: vi.fn(() => ({ entries: [] }))
        },
        secretProvider,
        netBirdService: {
            ensureInternalGroup: vi.fn(async () => ({ id: "group" })),
            ensureGroupAccessPolicy: vi.fn(async () => ({ id: "policy" })),
            syncPlatformNodePeers: vi.fn(async () => undefined)
        },
        netBirdEnrollment: {
            ensureSetupKey: vi.fn(async () => "setup-key")
        },
        controlPlaneSync: {
            publish: vi.fn(async () => null)
        },
        applyRevision: 0
    } as unknown as ControlPlaneContext;
}

function installApplyTestContext(context: ControlPlaneContext): void {
    ControlPlaneService.install(context);
    vi.spyOn(PipelineRunService, "createRun").mockResolvedValue({
        id: "apply-run-test-1",
        kind: "apply",
        status: "pending",
        manifestName: "minimal",
        createdAt: new Date().toISOString()
    } as never);
    vi.spyOn(PipelineRunService, "getRun").mockResolvedValue({
        id: "apply-run-test-1",
        kind: "apply",
        status: "pending",
        manifestName: "minimal",
        createdAt: new Date().toISOString()
    } as never);
    vi.spyOn(PipelineRunService, "markRunning").mockResolvedValue(undefined);
    vi.spyOn(PipelineRunService, "emitEvent").mockResolvedValue({
        id: "event-1",
        runId: "apply-run-test-1",
        kind: "gitops.sync.started",
        createdAt: new Date().toISOString()
    } as never);
    vi.spyOn(PipelineRunService, "completeRun").mockResolvedValue({
        id: "apply-run-test-1",
        kind: "apply",
        status: "succeeded",
        manifestName: "minimal",
        createdAt: new Date().toISOString()
    } as never);
    vi.spyOn(ClusterStateService, "saveApplyRevision").mockResolvedValue(undefined);
    vi.spyOn(ControlPlaneService.Gateway, "upsertRoute").mockResolvedValue(undefined);
    vi.spyOn(ControlPlaneService.Gateway, "requestAutoTls").mockResolvedValue(undefined);
    vi.spyOn(ControlPlaneService.Apply, "incrementRevision").mockImplementation(async () => {
        context.applyRevision += 1;
        return context.applyRevision;
    });
    vi.spyOn(ControlPlaneService.Apply, "getRevision").mockImplementation(() => context.applyRevision);
    vi.spyOn(BuildService, "resolveBuildOperations").mockImplementation(async (_context, _manifest, operations) => {
        return operations;
    });
}

describe("ApplyService phase 1.2", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("omits pull operations for build placeholders in dispatched plans", async () => {
        const context = createApplyTestContext();
        context.composeParser.parse = vi.fn(() => ({
            name: "minimal",
            services: {
                web: {
                    build: "./app",
                    capabilities: [],
                    secrets: [],
                    deploy: {
                        replicas: 1
                    }
                }
            },
            volumes: {},
            networks: {},
            registries: {}
        }));
        context.planner.diff = vi.fn(() => ({
            servicesToCreate: [{
                id: "minimal:web",
                name: "web",
                manifestName: "minimal",
                image: "build://./app",
                desiredReplicas: 1,
                status: "pending",
                capabilities: [],
                networks: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            servicesToUpdate: [],
            servicesToRemove: [],
            instancesToCreate: [{
                id: "minimal:web-1",
                serviceId: "minimal:web",
                serviceName: "web",
                nodeId: "unscheduled",
                status: "pending",
                image: "build://./app",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            instancesToRemove: [],
            volumesToEnsure: [],
            volumesToRemove: [],
            operations: [{
                type: "create",
                instanceId: "minimal:web-1",
                serviceName: "web",
                image: "build://./app",
                command: [],
                environment: {},
                volumes: [],
                networks: [],
                ports: [],
                secrets: []
            }, {
                type: "start",
                instanceId: "minimal:web-1"
            }]
        }));
        installApplyTestContext(context);

        vi.spyOn(ControlPlaneService.GitOps, "recordRevision").mockResolvedValue({
            id: "rev-1",
            repositoryUrl: "inline://apply",
            branch: "main",
            commitSha: "rev-1",
            manifestName: "minimal",
            createdAt: new Date().toISOString()
        } as never);

        const agentDispatcher = await import("../../../packages/control-plane/src/services/AgentDispatcher");
        vi.spyOn(agentDispatcher.AgentDispatcher, "dispatchPlans").mockResolvedValue([]);

        const result = await ApplyService.execute("name: minimal");

        expect(result.plans[0]?.operations.some((operation) => operation.type === "pull")).toBe(false);
    });

    it("fails explicitly when scheduling returns null", async () => {
        const context = createApplyTestContext();
        context.scheduler.schedule = vi.fn(() => null);
        installApplyTestContext(context);

        await expect(ApplyService.execute("name: minimal")).rejects.toMatchObject({
            message: 'No eligible node found for service "web".',
            statusCode: 503
        });
    });

    it("resolves secrets for create operations before dispatch", async () => {
        const context = createApplyTestContext();
        context.composeParser.parse = vi.fn(() => ({
            name: "minimal",
            services: {
                web: {
                    image: "nginx:1.27-alpine",
                    capabilities: [],
                    secrets: [{
                        secretName: "db-credentials",
                        key: "password"
                    }],
                    deploy: {
                        replicas: 1
                    }
                }
            },
            volumes: {},
            networks: {},
            registries: {}
        }));
        await context.secretProvider.upsert({
            name: "db-credentials",
            data: {
                password: "secret-value"
            }
        });
        installApplyTestContext(context);

        vi.spyOn(ControlPlaneService.GitOps, "recordRevision").mockResolvedValue({
            id: "rev-1",
            repositoryUrl: "inline://apply",
            branch: "main",
            commitSha: "rev-1",
            manifestName: "minimal",
            createdAt: new Date().toISOString()
        } as never);

        const agentDispatcher = await import("../../../packages/control-plane/src/services/AgentDispatcher");
        vi.spyOn(agentDispatcher.AgentDispatcher, "dispatchPlans").mockResolvedValue([]);

        const result = await ApplyService.execute("name: minimal");
        const createOp = result.plans
            .flatMap((plan) => plan.operations)
            .find((operation) => operation.type === "create");

        expect(createOp?.type).toBe("create");
        if (createOp?.type === "create") {
            expect(createOp.secrets).toEqual([{
                name: "db-credentials",
                data: {
                    password: "secret-value"
                }
            }]);
        }
    });

    it("removes retired instances and volumes from the store during apply", async () => {
        const context = createApplyTestContext();
        context.planner.diff = vi.fn(() => ({
            servicesToCreate: [],
            servicesToUpdate: [],
            servicesToRemove: [{
                id: "minimal:api",
                name: "api",
                manifestName: "minimal",
                image: "nginx:1.27-alpine",
                desiredReplicas: 1,
                status: "running",
                capabilities: [],
                networks: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            instancesToCreate: [],
            instancesToRemove: [{
                id: "minimal:api-1",
                serviceId: "minimal:api",
                serviceName: "api",
                nodeId: "agent-1",
                status: "running",
                image: "nginx:1.27-alpine",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            volumesToEnsure: [],
            volumesToRemove: [{
                id: "minimal:data",
                name: "data",
                manifestName: "minimal",
                scope: "cluster",
                nodeId: "agent-1",
                mountPath: "/var/lib/naulite/minimal/data",
                status: "bound",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            operations: [{
                type: "stop",
                instanceId: "minimal:api-1"
            }, {
                type: "remove",
                instanceId: "minimal:api-1",
                force: true
            }, {
                type: "removeVolume",
                volumeName: "data",
                force: false
            }]
        }));
        installApplyTestContext(context);

        vi.spyOn(ControlPlaneService.GitOps, "recordRevision").mockResolvedValue({
            id: "rev-1",
            repositoryUrl: "inline://apply",
            branch: "main",
            commitSha: "rev-1",
            manifestName: "minimal",
            createdAt: new Date().toISOString()
        } as never);

        const agentDispatcher = await import("../../../packages/control-plane/src/services/AgentDispatcher");
        const dispatchSpy = vi.spyOn(agentDispatcher.AgentDispatcher, "dispatchPlans").mockResolvedValue([{
            nodeId: "agent-1",
            planId: "minimal-agent-1-1",
            agentUrl: "http://agent-1",
            status: "dispatched"
        }]);

        await ApplyService.execute("name: minimal");

        expect(dispatchSpy).toHaveBeenCalled();
        expect(context.store.deleteInstance).toHaveBeenCalledWith("minimal:api-1");
        expect(context.store.deleteService).toHaveBeenCalledWith("minimal:api");
        expect(context.store.deleteVolumeByName).toHaveBeenCalledWith("data");
        expect(dispatchSpy.mock.invocationCallOrder[0]).toBeLessThan(
            context.store.deleteVolumeByName.mock.invocationCallOrder[0] ?? 0
        );
    });
});

describe("ApplyService filterOperationsForNode", () => {
    it("filters instance operations to the scheduled node only", () => {
        const operations: ExecutionOperation[] = [
            { type: "ensureVolume", volumeName: "data", mountPath: "/data" },
            { type: "pull", image: "nginx:alpine" },
            { type: "create", instanceId: "minimal:web-1", serviceName: "web", image: "nginx:alpine", command: [], environment: {}, volumes: [], networks: [], ports: [], secrets: [] },
            { type: "start", instanceId: "minimal:web-1" },
            { type: "stop", instanceId: "minimal:api-1" }
        ];
        const instanceNodes = new Map<string, string>([
            ["minimal:web-1", "agent-1"],
            ["minimal:api-1", "agent-2"]
        ]);
        const volumeNodes = new Map<string, string>([
            ["data", "agent-1"]
        ]);

        const agentOneOps = ApplyService.filterOperationsForNode(
            "agent-1",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );
        const agentTwoOps = ApplyService.filterOperationsForNode(
            "agent-2",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );

        expect(agentOneOps.some((op) => op.type === "start" && op.instanceId === "minimal:web-1")).toBe(true);
        expect(agentOneOps.some((op) => op.type === "stop")).toBe(false);
        expect(agentTwoOps.some((op) => op.type === "stop" && op.instanceId === "minimal:api-1")).toBe(true);
        expect(agentTwoOps.some((op) => op.type === "start")).toBe(false);
    });

    it("prepends pull operations after filtering creates to a single node", () => {
        const operations: ExecutionOperation[] = [
            { type: "create", instanceId: "minimal:web-1", serviceName: "web", image: "nginx:alpine", command: [], environment: {}, volumes: [], networks: [], ports: [], secrets: [] },
            { type: "start", instanceId: "minimal:web-1" }
        ];
        const instanceNodes = new Map<string, string>([
            ["minimal:web-1", "agent-1"]
        ]);
        const volumeNodes = new Map<string, string>();
        const nodes = [{ id: "agent-1" }, { id: "agent-2" }] as never;

        const agentOneOps = ApplyService.addPullOperations(
            ApplyService.filterOperationsForNode("agent-1", operations, instanceNodes, volumeNodes, nodes)
        );
        const agentTwoOps = ApplyService.addPullOperations(
            ApplyService.filterOperationsForNode("agent-2", operations, instanceNodes, volumeNodes, nodes)
        );

        expect(agentOneOps[0]).toEqual({ type: "pull", image: "nginx:alpine" });
        expect(agentOneOps.some((op) => op.type === "create")).toBe(true);
        expect(agentTwoOps).toEqual([]);
    });

    it("routes removeVolume operations to the node that owns the volume", () => {
        const operations: ExecutionOperation[] = [
            { type: "removeVolume", volumeName: "data", force: false },
            { type: "removeVolume", volumeName: "cache", force: false }
        ];
        const instanceNodes = new Map<string, string>();
        const volumeNodes = new Map<string, string>([
            ["data", "agent-1"],
            ["cache", "agent-2"]
        ]);

        const agentOneOps = ApplyService.filterOperationsForNode(
            "agent-1",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );
        const agentTwoOps = ApplyService.filterOperationsForNode(
            "agent-2",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );

        expect(agentOneOps).toEqual([{ type: "removeVolume", volumeName: "data", force: false }]);
        expect(agentTwoOps).toEqual([{ type: "removeVolume", volumeName: "cache", force: false }]);
    });

    it("returns empty plans for idle nodes", () => {
        const operations: ExecutionOperation[] = [
            { type: "start", instanceId: "minimal:web-1" }
        ];
        const instanceNodes = new Map<string, string>([
            ["minimal:web-1", "agent-1"]
        ]);
        const volumeNodes = new Map<string, string>();

        const idleOps = ApplyService.filterOperationsForNode(
            "agent-2",
            operations,
            instanceNodes,
            volumeNodes,
            [{ id: "agent-1" }, { id: "agent-2" }] as never
        );

        expect(idleOps).toEqual([]);
    });
});
