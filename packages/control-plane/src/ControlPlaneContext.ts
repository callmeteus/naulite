import { PluginRegistry } from "@platform/shared";

import type { DatabaseProvider } from "./database/DatabaseProvider.js";
import { ControlPlaneStore } from "./database/ControlPlaneStore.js";
import { GitOpsService } from "./gitops/GitOpsService.js";
import { ComposeParser } from "./orchestration/ComposeParser.js";
import { ExposurePlanner } from "./orchestration/ExposurePlanner.js";
import { Planner } from "./orchestration/Planner.js";
import { Scheduler } from "./orchestration/Scheduler.js";
import { PluginLoader } from "./plugins/PluginLoader.js";
import { BackupScheduler } from "./schedulers/BackupScheduler.js";
import { LogRotationScheduler } from "./schedulers/LogRotationScheduler.js";
import { ControlPlaneSync } from "./sync/ControlPlaneSync.js";
import type { NetBirdService } from "./netbird/NetBirdService.js";
import { createNetBirdService } from "./netbird/createNetBirdService.js";

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
        store: new ControlPlaneStore(databaseProvider),
        pluginRegistry: new PluginRegistry(),
        pluginLoader: new PluginLoader(packagesDir),
        composeParser: new ComposeParser(),
        planner: new Planner(),
        scheduler: new Scheduler(),
        exposurePlanner: new ExposurePlanner(),
        gitOpsService: new GitOpsService(databaseProvider),
        backupScheduler: new BackupScheduler(databaseProvider),
        logRotationScheduler: new LogRotationScheduler(databaseProvider),
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
