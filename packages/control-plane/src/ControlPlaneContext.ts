import { PluginRegistry } from "@platform/shared";

import { ControlPlaneStore } from "./database/ControlPlaneStore";
import type { DatabaseProvider } from "./database/DatabaseProvider";
import { NetBirdEnrollmentService } from "./services/NetBirdEnrollmentService";
import { createNetBirdService } from "./services/CreateNetBirdService";
import type { NetBirdCredentials } from "./services/NetBirdBootstrap";
import type { NetBirdService } from "./services/NetBirdService";
import { NetBirdConfig } from "./services/NetBirdConfig";
import { SelfHostedNetBirdAdapter } from "./services/SelfHostedNetBirdAdapter";
import { ComposeParser } from "./orchestration/ComposeParser";
import { ExposurePlanner } from "./orchestration/ExposurePlanner";
import { Planner } from "./orchestration/Planner";
import { Scheduler } from "./orchestration/Scheduler";
import { PluginLoader } from "./plugins/PluginLoader";
import { BackupScheduler } from "./modules/backup/BackupScheduler";
import { LogRotationScheduler } from "./modules/log-rotation/LogRotationScheduler";
import { ControlPlaneSync } from "./services/ControlPlaneSync";
/**
 * Shared control plane application context.
 */
export interface ControlPlaneContext {
    databaseProvider: DatabaseProvider;
    store: ControlPlaneStore;
    pluginRegistry: PluginRegistry;
    pluginLoader: PluginLoader;
    composeParser: ComposeParser;
    planner: Planner;
    scheduler: Scheduler;
    exposurePlanner: ExposurePlanner;
    backupScheduler: BackupScheduler;    logRotationScheduler: LogRotationScheduler;
    controlPlaneSync: ControlPlaneSync;
    netBirdService: NetBirdService;
    netBirdEnrollment: NetBirdEnrollmentService;
    applyRevision: number;
}

/**
 * Options for building the control plane application context.
 */
export interface CreateControlPlaneContextOptions {
    netBirdCredentials?: NetBirdCredentials;
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
    const netBirdService = createNetBirdService(options.netBirdCredentials);
    const netBirdEnrollment = createNetBirdEnrollmentService(store, options.netBirdCredentials);

    return {
        databaseProvider,
        store,
        pluginRegistry: new PluginRegistry(),
        pluginLoader: new PluginLoader(packagesDir),
        composeParser: new ComposeParser(),
        planner: new Planner(),
        scheduler: new Scheduler(),
        exposurePlanner: new ExposurePlanner(),
        backupScheduler: new BackupScheduler(),        logRotationScheduler: new LogRotationScheduler(),
        controlPlaneSync: new ControlPlaneSync(databaseProvider),
        netBirdService,
        netBirdEnrollment,
        applyRevision: 0
    };
}

/**
 * Builds the NetBird enrollment service for agent bootstrap flows.
 *
 * @param store Control plane persistence layer
 * @param credentials Bootstrapped NetBird API credentials
 * @returns NetBird enrollment service
 */
function createNetBirdEnrollmentService(
    store: ControlPlaneStore,
    credentials?: NetBirdCredentials
): NetBirdEnrollmentService {
    if (NetBirdConfig.useMockAdapter()) {
        return new NetBirdEnrollmentService(store, new SelfHostedNetBirdAdapter({
            apiUrl: "http://mock-netbird",
            token: credentials?.apiToken ?? "mock-netbird-token"
        }));
    }

    return new NetBirdEnrollmentService(store, new SelfHostedNetBirdAdapter({
        apiUrl: NetBirdConfig.resolveApiUrl(),
        token: credentials?.apiToken ?? process.env.NETBIRD_TOKEN
    }));
}

