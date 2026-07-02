import Fastify, { type FastifyInstance } from "fastify";

import { ControlPlaneService } from "./ControlPlaneService";
import { createControlPlaneContext, type ControlPlaneContext } from "./ControlPlaneContext";
import { DatabaseProvider } from "./database/DatabaseProvider";
import { registerErrorHandler } from "./errors/RegisterErrorHandler";
import { registerRoutes } from "./routes/index";

/**
 * Options for creating the control plane Fastify application.
 */
export interface CreateAppOptions {
    context?: ControlPlaneContext;
    packagesDir?: string;
    databaseProvider?: DatabaseProvider;
    logger?: boolean;
}

/**
 * Creates and configures the control plane Fastify application.
 * 
 * @param options Application bootstrap options
 * @returns Configured Fastify instance
 */
export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
    const databaseProvider = options.databaseProvider ?? new DatabaseProvider();
    const packagesDir = options.packagesDir ?? process.env.PLATFORM_PACKAGES_DIR ?? "./packages";
    const context = options.context ?? createControlPlaneContext(databaseProvider, packagesDir);
    const app = Fastify({
        logger: options.logger ?? true
    });

    ControlPlaneService.install(context);

    registerErrorHandler(app);

    await registerRoutes(app);
    return app;
}
