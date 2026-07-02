import Fastify, { type FastifyInstance } from "fastify";

import { createControlPlaneContext, type ControlPlaneContext } from "./ControlPlaneContext.js";
import { registerAuthMiddleware } from "./auth/AuthMiddleware.js";
import { DatabaseProvider } from "./database/DatabaseProvider.js";
import { ComposeParserError } from "./errors/orchestration/compose/ComposeParserError.js";
import { registerRoutes } from "./routes/index.js";

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

    app.decorate("controlPlane", context);

    await registerAuthMiddleware(app);

    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof ComposeParserError) {
            reply.code(error.statusCode);
            return {
                code: error.code,
                message: error.message,
                details: error.details
            };
        }

        if (error instanceof Error && "issues" in error) {
            reply.code(400);
            return {
                message: "Validation failed.",
                details: error
            };
        }

        app.log.error({ err: error }, "request failed");
        reply.code(500);
        return {
            message: error instanceof Error ? error.message : "Internal server error."
        };
    });

    await registerRoutes(app);
    return app;
}
