import { createDockerBuilderProvider } from "@naulite/builder-docker";
import { createKanikoBuilderProvider } from "@naulite/builder-kaniko";
import { PluginRegistry } from "@naulite/shared";
import {
    createTraefikNetBirdGatewayProvider,
    type TraefikNetBirdGatewayProvider
} from "@naulite/gateway";
import type { BuilderProvider } from "@naulite/shared";

import { ControlPlaneStore } from "./database/ControlPlaneStore";
import type { DatabaseProvider } from "./database/DatabaseProvider";
import { createBackupOrchestrator, type BackupOrchestrator } from "./modules/backup/BackupOrchestrator";
import { createContainerRegistryService, type ContainerRegistryService } from "./modules/container-registry/ContainerRegistryService";
import { createLocalSecretProvider } from "./modules/secrets/LocalSecretProvider";
import { createPostgresSecretProvider } from "./modules/secrets/PostgresSecretProvider";
import { resolveSecretBackendId } from "./modules/secrets/PluginSecretProviderAdapter";
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
        () => process.env.NAULITE_PUBLIC_URL?.replace(/\/+$/, "") ?? "http://localhost:8080"
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
    const secretsService = new SecretsService(store, masterKey);

    return {
        instanceId,
        databaseProvider,
        store,
        pluginRegistry: new PluginRegistry(),
        pluginLoader: new PluginLoader(packagesDir),
        secretProviderRegistry: new SecretProviderRegistry(),
        runtimeRegistry: RuntimeLoader.load(),
        backupOrchestrator,
        secretProvider: createDefaultSecretProvider(secretsService, masterKey),
        secretsService,
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

/**
 * Creates the default secret provider for the configured backend.
 *
 * @param secretsService Encrypted secrets service backed by the control plane store
 * @param masterKey Master encryption key material for local backend
 * @returns Configured secret provider
 */
function createDefaultSecretProvider(secretsService: SecretsService, masterKey: string): SecretProvider {
    const backendId = resolveSecretBackendId();
    console.debug("[secrets] default provider backend=%s", backendId);

    if (backendId === "local") {
        return createLocalSecretProvider({ masterKey });
    }

    return createPostgresSecretProvider(secretsService);
}
