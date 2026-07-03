import { PlatformApiError, PlatformClient } from "@platform/sdk";
import Fastify, { type FastifyInstance } from "fastify";

import { AuthPreHandlers } from "./auth/AuthPreHandlers";
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

    app.addHook("onRequest", async (request, reply) => {
        if (request.url === "/health" || request.url.startsWith("/health?")) {
            return;
        }

        try {
            AuthPreHandlers.enforceAdminApiKey(request, options.adminApiKey ?? envConfig.adminApiKey);
        } catch (error) {
            const statusCode = error instanceof Error && "statusCode" in error
                ? Number((error as Error & { statusCode: number }).statusCode)
                : 401;

            return reply.code(statusCode).send({
                message: error instanceof Error ? error.message : "Unauthorized."
            });
        }
    });

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
