import { PluginRegistry } from "@platform/shared";

import { ControlPlaneStore } from "./database/ControlPlaneStore";
import type { DatabaseProvider } from "./database/DatabaseProvider";
import { GitOpsService } from "./services/GitOpsService";
import { createNetBirdService } from "./services/CreateNetBirdService";
import type { NetBirdCredentials } from "./services/NetBirdBootstrap";
import type { NetBirdService } from "./services/NetBirdService";
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
    gitOpsService: GitOpsService;
    backupScheduler: BackupScheduler;
    logRotationScheduler: LogRotationScheduler;
    controlPlaneSync: ControlPlaneSync;
    netBirdService: NetBirdService;
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
    return {
        databaseProvider,
        store: new ControlPlaneStore(),
        pluginRegistry: new PluginRegistry(),
        pluginLoader: new PluginLoader(packagesDir),
        composeParser: new ComposeParser(),
        planner: new Planner(),
        scheduler: new Scheduler(),
        exposurePlanner: new ExposurePlanner(),
        gitOpsService: new GitOpsService(),
        backupScheduler: new BackupScheduler(),
        logRotationScheduler: new LogRotationScheduler(),
        controlPlaneSync: new ControlPlaneSync(databaseProvider),
        netBirdService: createNetBirdService(options.netBirdCredentials),
        applyRevision: 0
    };
}

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: ControlPlaneContext;
    }
}
