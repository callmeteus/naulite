import { PlatformApiError, PlatformClient } from "@platform/sdk";
import Fastify, { type FastifyInstance } from "fastify";

import { AuthPreHandlers } from "./auth/AuthPreHandlers";
import { RolePreHandlers } from "./auth/RolePreHandlers";
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
        if (AuthPreHandlers.isPublicRoute(request.url, request.method)) {
            return;
        }

        try {
            await AuthPreHandlers.authenticateRequest(
                request,
                options.adminApiKey ?? envConfig.adminApiKey
            );
        } catch (error) {
            const statusCode = error instanceof Error && "statusCode" in error
                ? Number((error as Error & { statusCode: number }).statusCode)
                : 401;

            return reply.code(statusCode).send({
                message: error instanceof Error ? error.message : "Não autorizado."
            });
        }
    });

    app.addHook("preHandler", async (request, reply) => {
        if (AuthPreHandlers.isPublicRoute(request.url, request.method)) {
            return;
        }

        const path = request.url.split("?")[0] ?? request.url;
        const method = request.method.toUpperCase();

        try {
            if (path.startsWith("/admin/users") || path.startsWith("/api-keys") || path.startsWith("/secrets")) {
                if (!RolePreHandlers.canAdmin(request)) {
                    throw Object.assign(new Error("Permissão insuficiente."), { statusCode: 403 });
                }
                return;
            }

            if (
                method === "POST" &&
                (path === "/apply" ||
                    path === "/build" ||
                    path === "/nodes/provision" ||
                    path.startsWith("/backups/") ||
                    (path.startsWith("/nodes/provisions/") && path.endsWith("/terminate")))
            ) {
                if (!RolePreHandlers.canOperate(request)) {
                    throw Object.assign(new Error("Permissão insuficiente."), { statusCode: 403 });
                }
                return;
            }

            if (!RolePreHandlers.canView(request)) {
                throw Object.assign(new Error("Permissão insuficiente."), { statusCode: 403 });
            }
        } catch (error) {
            const statusCode = error instanceof Error && "statusCode" in error
                ? Number((error as Error & { statusCode: number }).statusCode)
                : 403;

            return reply.code(statusCode).send({
                message: error instanceof Error ? error.message : "Permissão insuficiente."
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

        if (error instanceof Error && "statusCode" in error) {
            const statusCode = Number((error as Error & { statusCode: number }).statusCode);
            reply.code(statusCode);
            return {
                message: error.message
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
