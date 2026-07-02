import { PluginRegistry } from "@platform/shared";

import { ControlPlaneStore } from "./database/ControlPlaneStore.js";
import type { DatabaseProvider } from "./database/DatabaseProvider.js";
import { GitOpsService } from "./services/GitOpsService.js";
import { createNetBirdService } from "./services/CreateNetBirdService.js";
import type { NetBirdService } from "./services/NetBirdService.js";
import { ComposeParser } from "./orchestration/ComposeParser.js";
import { ExposurePlanner } from "./orchestration/ExposurePlanner.js";
import { Planner } from "./orchestration/Planner.js";
import { Scheduler } from "./orchestration/Scheduler.js";
import { PluginLoader } from "./plugins/PluginLoader.js";
import { BackupScheduler } from "./services/BackupScheduler.js";
import { LogRotationScheduler } from "./services/LogRotationScheduler.js";
import { ControlPlaneSync } from "./services/ControlPlaneSync.js";

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
 * Builds the default control plane application context.
 * 
 * @param databaseProvider Connected database provider
 * @param packagesDir Packages directory for plugin discovery
 * @returns Control plane context
 */
export function createControlPlaneContext(
    databaseProvider: DatabaseProvider,
    packagesDir: string
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
        netBirdService: createNetBirdService(),
        applyRevision: 0
    };
}

declare module "fastify" {
    interface FastifyInstance {
        controlPlane: ControlPlaneContext;
    }
}
