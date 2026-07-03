import "reflect-metadata";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./App";
import { createControlPlaneContext } from "./ControlPlaneContext";
import { ControlPlaneStore } from "./database/ControlPlaneStore";
import { DatabaseProvider } from "./database/DatabaseProvider";
import { PluginRegistryWiring } from "./plugins/PluginRegistryWiring";
import { ClusterStateService } from "./services/ClusterStateService";
import { ControlPlaneSyncSubscribers } from "./services/ControlPlaneSyncSubscribers";
import { NetBirdBootstrap } from "./services/NetBirdBootstrap";

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
 * Boots the control plane HTTP server and background workers.
 * 
 * @param options Server startup options
 * @returns Running server handle
 */
export async function startServer(options: StartServerOptions = {}): Promise<ControlPlaneServer> {
    const host = options.host ?? process.env.HOST ?? "0.0.0.0";
    const port = Number(options.port ?? process.env.PORT ?? 8080);
    const packagesDir = options.packagesDir
        ?? process.env.PLATFORM_PACKAGES_DIR
        ?? join(moduleDir, "..", "..");
    const databaseProvider = options.databaseProvider ?? new DatabaseProvider();

    await databaseProvider.connect(DatabaseProvider.resolveOptionsFromEnv());
    await databaseProvider.migrate();

    const store = new ControlPlaneStore();
    const netBirdCredentials = await NetBirdBootstrap.ensureCredentials(store);
    const applyRevision = await ClusterStateService.loadApplyRevision();
    const context = createControlPlaneContext(databaseProvider, packagesDir, {
        netBirdCredentials,
        applyRevision
    });
    await context.pluginLoader.load(context.pluginRegistry);
    PluginRegistryWiring.wire(context);
    ControlPlaneSyncSubscribers.register(context);
    context.leaderElection.setOnBecameLeader(async () => {
        await context.gatewayRouteService.hydrateFromDatabase();
    });
    context.leaderElection.start();
    await context.gatewayRouteService.hydrateFromDatabase();
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
            context.leaderElection.stop();
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
