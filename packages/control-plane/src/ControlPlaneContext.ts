import { createDockerBuilderProvider } from "@platform/builder-docker";
import { createKanikoBuilderProvider } from "@platform/builder-kaniko";
import { PluginRegistry } from "@platform/shared";
import {
    createTraefikNetBirdGatewayProvider,
    type TraefikNetBirdGatewayProvider
} from "@platform/gateway";
import type { BuilderProvider } from "@platform/shared";

import { ControlPlaneStore } from "./database/ControlPlaneStore";
import type { DatabaseProvider } from "./database/DatabaseProvider";
import { createBackupOrchestrator, type BackupOrchestrator } from "./modules/backup/BackupOrchestrator";
import { createContainerRegistryService, type ContainerRegistryService } from "./modules/container-registry/ContainerRegistryService";
import { createLocalSecretProvider } from "./modules/secrets/LocalSecretProvider";
import type { SecretProvider } from "./modules/secrets/SecretProvider";
import { ComposeParser } from "./orchestration/ComposeParser";
import { ExposurePlanner } from "./orchestration/ExposurePlanner";
import { Planner } from "./orchestration/Planner";
import { Scheduler } from "./orchestration/Scheduler";
import { BackupScheduler } from "./modules/backup/BackupScheduler";
import { LogRotationScheduler } from "./modules/log-rotation/LogRotationScheduler";
import { NodeProvisionerRegistry } from "./plugins/NodeProvisionerRegistry";
import { PluginLoader } from "./plugins/PluginLoader";
import { SecretProviderRegistry } from "./plugins/SecretProviderRegistry";
import { RuntimeLoader } from "./runtimes/RuntimeLoader";
import { RuntimeRegistry } from "./runtimes/RuntimeRegistry";
import { ControlPlaneInstanceId } from "./services/ControlPlaneInstanceId";
import { ControlPlaneSync } from "./services/ControlPlaneSync";
import { AgentProxyService } from "./services/AgentProxyService";
import { createNetBirdAdapter } from "./services/CreateNetBirdService";
import { GatewayConfig } from "./services/GatewayConfig";
import { GatewayRouteService } from "./services/GatewayRouteService";
import { LeaderElection } from "./services/LeaderElection";
import { NetBirdEnrollmentService } from "./services/NetBirdEnrollmentService";
import type { NetBirdCredentials } from "./services/NetBirdBootstrap";
import { NetBirdService } from "./services/NetBirdService";
import { createNodeProvisionService, type NodeProvisionService } from "./services/NodeProvisionService";
import { createMetricsSyncService, type MetricsSyncService } from "./services/MetricsSyncService";
import { SecretsService, resolveSecretMasterKey } from "./services/SecretsService";

/**
 * Shared control plane application context.
 */
export interface ControlPlaneContext {
    instanceId: string;
    databaseProvider: DatabaseProvider;
    store: ControlPlaneStore;
    pluginRegistry: PluginRegistry;
    pluginLoader: PluginLoader;
    secretProviderRegistry: SecretProviderRegistry;
    runtimeRegistry: RuntimeRegistry;
    backupOrchestrator: BackupOrchestrator;
    secretProvider: SecretProvider;
    secretsService: SecretsService;
    composeParser: ComposeParser;
    planner: Planner;
    scheduler: Scheduler;
    exposurePlanner: ExposurePlanner;
    backupScheduler: BackupScheduler;
    logRotationScheduler: LogRotationScheduler;
    containerRegistryService: ContainerRegistryService;
    controlPlaneSync: ControlPlaneSync;
    leaderElection: LeaderElection;
    netBirdService: NetBirdService;
    netBirdEnrollment: NetBirdEnrollmentService;
    gatewayProvider: TraefikNetBirdGatewayProvider;
    gatewayRouteService: GatewayRouteService;
    nodeProvisionerRegistry: NodeProvisionerRegistry;
    nodeProvisionService: NodeProvisionService;
    metricsSyncService: MetricsSyncService;
    builderProviders: Map<string, BuilderProvider>;
    applyRevision: number;
}

/**
 * Options for building the control plane application context.
 */
export interface CreateControlPlaneContextOptions {
    netBirdCredentials?: NetBirdCredentials;
    instanceId?: string;
    applyRevision?: number;
}

/**
 * Builds the default control plane application context.
 * 
 * @param databaseProvider Connected database provider
 * @param packagesDir Packages directory for plugin discovery
 * @param options Optional context overrides
 * @returns Control plane context
 */
export function createControlPlaneContext(
    databaseProvider: DatabaseProvider,
    packagesDir: string,
    options: CreateControlPlaneContextOptions = {}
): ControlPlaneContext {
    const store = new ControlPlaneStore();
    const instanceId = options.instanceId ?? ControlPlaneInstanceId.resolve();
    const netBirdAdapter = createNetBirdAdapter(options.netBirdCredentials);
    const netBirdService = new NetBirdService(netBirdAdapter);
    const netBirdEnrollment = new NetBirdEnrollmentService(store, netBirdAdapter);
    const masterKey = resolveSecretMasterKey();
    const nodeProvisionerRegistry = new NodeProvisionerRegistry();
    const nodeProvisionService = createNodeProvisionService(
        store,
        netBirdEnrollment,
        nodeProvisionerRegistry,
        () => process.env.PLATFORM_PUBLIC_URL?.replace(/\/+$/, "") ?? "http://localhost:8080"
    );
    const builderProviders = createBuilderProviders();
    const backupOrchestrator = createBackupOrchestrator();
    const leaderElection = new LeaderElection(databaseProvider, instanceId);
    const controlPlaneSync = new ControlPlaneSync(databaseProvider, instanceId);
    const gatewayProvider = createTraefikNetBirdGatewayProvider({
        netbirdEndpoint: GatewayConfig.resolveNetbirdEndpoint(),
        traefikApiUrl: GatewayConfig.resolveTraefikApiUrl(),
        traefikDynamicConfigUrl: GatewayConfig.resolveTraefikDynamicConfigUrl()
    });
    const gatewayRouteService = new GatewayRouteService(gatewayProvider, leaderElection, controlPlaneSync);
    const metricsSyncService = createMetricsSyncService(store, leaderElection);

    return {
        instanceId,
        databaseProvider,
        store,
        pluginRegistry: new PluginRegistry(),
        pluginLoader: new PluginLoader(packagesDir),
        secretProviderRegistry: new SecretProviderRegistry(),
        runtimeRegistry: RuntimeLoader.load(),
        backupOrchestrator,
        secretProvider: createLocalSecretProvider({ masterKey }),
        secretsService: new SecretsService(store, masterKey),
        composeParser: new ComposeParser(),
        planner: new Planner(),
        scheduler: new Scheduler(),
        exposurePlanner: new ExposurePlanner(),
        backupScheduler: new BackupScheduler(60_000, AgentProxyService.postTask, {
            backupOrchestrator,
            isLeader: () => leaderElection.isLeader()
        }),
        logRotationScheduler: new LogRotationScheduler(60_000, AgentProxyService.postTask, {
            isLeader: () => leaderElection.isLeader()
        }),
        containerRegistryService: createContainerRegistryService(),
        controlPlaneSync,
        leaderElection,
        netBirdService,
        netBirdEnrollment,
        gatewayProvider,
        gatewayRouteService,
        nodeProvisionerRegistry,
        nodeProvisionService,
        metricsSyncService,
        builderProviders,
        applyRevision: options.applyRevision ?? 0
    };
}

/**
 * Creates builder provider instances without eager top-level imports.
 *
 * @returns Registered builder providers keyed by provider id
 */
function createBuilderProviders(): Map<string, BuilderProvider> {
    return new Map<string, BuilderProvider>([
        ["docker", createDockerBuilderProvider()],
        ["kaniko", createKanikoBuilderProvider()]
    ]);
}
