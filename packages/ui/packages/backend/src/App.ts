import { PlatformApiError, PlatformClient } from "@platform/sdk";
import Fastify, { type FastifyInstance } from "fastify";

import { resolveConfigFromEnv } from "./Config";
import { registerRoutes } from "./routes/index";

/**
 * Options for creating the admin API Fastify application.
 */
export interface CreateAppOptions {
    controlPlaneUrl?: string;
    adminApiKey?: string;
    logger?: boolean;
}

/**
 * Creates and configures the admin API (BFF) Fastify application.
 *
 * @param options Application bootstrap options
 * @returns Configured Fastify instance
 */
export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
    const envConfig = resolveConfigFromEnv();
    const controlPlane = new PlatformClient({
        baseUrl: options.controlPlaneUrl ?? envConfig.controlPlaneUrl,
        token: options.adminApiKey ?? envConfig.adminApiKey
    });

    const app = Fastify({
        logger: options.logger ?? true
    });

    app.decorate("controlPlane", controlPlane);

    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof PlatformApiError) {
            reply.code(error.status);
            return {
                message: error.message
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
