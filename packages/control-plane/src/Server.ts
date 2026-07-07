import "reflect-metadata";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./App";
import { createControlPlaneContext } from "./ControlPlaneContext";
import { ControlPlaneStore } from "./database/ControlPlaneStore";
import { DatabaseProvider } from "./database/DatabaseProvider";
import { PluginRegistryWiring } from "./plugins/PluginRegistryWiring";
import { AdminBootstrap } from "./modules/admin/AdminBootstrap";
import { ClusterStateService } from "./services/ClusterStateService";
import { ControlPlaneSync } from "./services/ControlPlaneSync";
import { ControlPlaneSyncSubscribers } from "./services/ControlPlaneSyncSubscribers";
import { ControlPlaneInstanceId } from "./services/ControlPlaneInstanceId";
import { LeaderElection } from "./services/LeaderElection";
import { NetBirdBootstrap } from "./services/NetBirdBootstrap";
import { Logger } from "./Logger";
const log_migrations = Logger.create("migrations");


/**
 * Server startup options.
 */
export interface StartServerOptions {
    host?: string;
    port?: number;
    packagesDir?: string;
    databaseProvider?: DatabaseProvider;
}

/**
 * Running control plane server handle.
 */
export interface ControlPlaneServer {
    host: string;
    port: number;
    databaseProvider: DatabaseProvider;
    stop: () => Promise<void>;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Applies migrations on the leader and waits on followers when PostgreSQL HA is enabled.
 *
 * @param databaseProvider Connected database provider
 * @param instanceId Control plane instance identifier
 * @returns Nothing.
 */
async function runMigrationsWithLeaderGate(
    databaseProvider: DatabaseProvider,
    instanceId: string
): Promise<void> {
    if (databaseProvider.getDialect() !== "postgresql") {
        await databaseProvider.migrate();
        return;
    }

    if (!await databaseProvider.hasLeaderElectionTable()) {
        log_migrations.debug("bootstrap leader table missing, running full migrate instanceId=%s", instanceId);
        await databaseProvider.migrate();
        return;
    }

    const bootstrapLeader = new LeaderElection(databaseProvider, instanceId);
    bootstrapLeader.start();
    await waitForLeaderElectionReady(bootstrapLeader, 20_000);

    if (bootstrapLeader.isLeader()) {
        log_migrations.debug("leader applying pending migrations instanceId=%s", instanceId);
        await databaseProvider.migrate();
    } else {
        log_migrations.debug("follower waiting for migrations instanceId=%s", instanceId);
        await databaseProvider.waitUntilMigrationsApplied();
    }

    bootstrapLeader.stop();
}

/**
 * Waits until leader election completes its first lease attempt.
 *
 * @param leaderElection Leader election service
 * @param timeoutMs Maximum wait time in milliseconds
 * @returns Nothing.
 */
async function waitForLeaderElectionReady(
    leaderElection: LeaderElection,
    timeoutMs: number
): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
        if (leaderElection.isLeader()) {
            return;
        }

        await new Promise((resolve) => {
            setTimeout(resolve, 250);
        });
    }
}

/**
 * Boots the control plane HTTP server and background workers.
 * 
 * @param options Server startup options
 * @returns Running server handle
 */
export async function startServer(options: StartServerOptions = {}): Promise<ControlPlaneServer> {
    const host = options.host ?? process.env.HOST ?? "0.0.0.0";
    const port = Number(options.port ?? process.env.PORT ?? 8080);
    const packagesDir = options.packagesDir
        ?? process.env.NAULITE_PACKAGES_DIR
        ?? join(moduleDir, "..", "..");
    const databaseProvider = options.databaseProvider ?? new DatabaseProvider();
    const instanceId = ControlPlaneInstanceId.resolve();

    await databaseProvider.connect(DatabaseProvider.resolveOptionsFromEnv());
    await runMigrationsWithLeaderGate(databaseProvider, instanceId);
    await AdminBootstrap.ensureFromEnv();

    const store = new ControlPlaneStore();
    const netBirdCredentials = await NetBirdBootstrap.ensureCredentials(store);
    const applyRevision = await ClusterStateService.loadApplyRevision();
    const context = createControlPlaneContext(databaseProvider, packagesDir, {
        netBirdCredentials,
        applyRevision,
        instanceId
    });
    await context.pluginLoader.load(context.pluginRegistry);
    PluginRegistryWiring.wire(context);
    ControlPlaneSyncSubscribers.register(context);
    context.leaderElection.setOnBecameLeader(async () => {
        await context.gatewayRouteService.hydrateFromDatabase();
        await context.metricsSyncService.syncIfLeader();
        await context.controlPlaneSync.publish(ControlPlaneSync.EVENTS.LEADER_CHANGED, {
            leaderId: context.instanceId
        });
    });
    context.leaderElection.start();
    context.nodeProvisionService.startStatusPolling(context.leaderElection);
    await context.gatewayRouteService.hydrateFromDatabase();
    context.metricsSyncService.start();
    context.backupScheduler.start();
    context.logRotationScheduler.start();
    context.controlPlaneSync.start();

    const app = await createApp({
        context,
        databaseProvider,
        packagesDir
    });

    await app.listen({ host, port });

    return {
        host,
        port,
        databaseProvider,
        stop: async () => {
            context.nodeProvisionService.stopStatusPolling();
            context.leaderElection.stop();
            context.metricsSyncService.stop();
            context.backupScheduler.stop();
            context.logRotationScheduler.stop();
            context.controlPlaneSync.stop();
            await app.close();
            await databaseProvider.disconnect();
        }
    };
}

/**
 * Starts the server when executed as the package entrypoint.
 * 
 * @returns Nothing.
 */
async function main(): Promise<void> {
    const server = await startServer();

    const shutdown = async () => {
        await server.stop();
        process.exit(0);
    };

    process.on("SIGINT", () => {
        void shutdown();
    });
    process.on("SIGTERM", () => {
        void shutdown();
    });
}

const isMainModule = process.argv[1] !== undefined
    && fileURLToPath(import.meta.url) === process.argv[1];

if (isMainModule) {
    void main();
}
