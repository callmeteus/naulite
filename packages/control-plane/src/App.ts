import Fastify, { type FastifyInstance } from "fastify";
import { createFastifyLoggerOptions } from "@naulite/logger";

import { ControlPlaneService } from "./ControlPlaneService";
import { createControlPlaneContext, type ControlPlaneContext } from "./ControlPlaneContext";
import { DatabaseProvider } from "./database/DatabaseProvider";
import { registerErrorHandler } from "./errors/RegisterErrorHandler";
import { Logger } from "./Logger";
import { registerOpenApi } from "./openapi/RegisterOpenApi";
import { registerRawBodyParser } from "./openapi/RegisterRawBodyParser";
import { registerRoutes } from "./routes/index";
import { registerExecWebSocket } from "./routing/RegisterExecWebSocket";
import { registerFunctionIngressFallback } from "./routing/RegisterFunctionIngressFallback";

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
    const packagesDir = options.packagesDir ?? process.env.NAULITE_PACKAGES_DIR ?? "./packages";
    const context = options.context ?? createControlPlaneContext(databaseProvider, packagesDir);
    const httpLog = Logger.create("http");
    const app = Fastify({
        ...createFastifyLoggerOptions(httpLog, options.logger !== false)
    });

    ControlPlaneService.install(context);

    registerErrorHandler(app);

    await registerRawBodyParser(app);
    await registerOpenApi(app);
    await registerRoutes(app);
    await registerFunctionIngressFallback(app);
    await registerExecWebSocket(app);
    return app;
}
