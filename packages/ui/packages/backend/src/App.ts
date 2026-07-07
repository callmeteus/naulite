import { NauliteApiError, NauliteClient } from "@naulite/sdk";
import Fastify, { type FastifyInstance } from "fastify";
import { toFastifyLogger } from "@naulite/logger";

import { AuthPreHandlers } from "./auth/AuthPreHandlers";
import { CsrfProtection } from "./auth/CsrfProtection";
import {
    PermissionPreHandlers,
    resolveBffRoutePermissions
} from "./auth/PermissionPreHandlers";
import { resolveConfigFromEnv } from "./Config";
import { Logger } from "./Logger";
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
    const controlPlane = new NauliteClient({
        baseUrl: options.controlPlaneUrl ?? envConfig.controlPlaneUrl,
        token: options.adminApiKey ?? envConfig.adminApiKey
    });

    const httpLog = Logger.create("http");
    const app = Fastify({
        logger: options.logger === false ? false : toFastifyLogger(httpLog)
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

        if (CsrfProtection.requiresValidation(request) && !CsrfProtection.isValid(request)) {
            return reply.code(403).send({
                message: "Token CSRF inválido ou ausente."
            });
        }

        const path = request.url.split("?")[0] ?? request.url;
        const method = request.method.toUpperCase();
        const requiredPermissions = resolveBffRoutePermissions(path, method);

        try {
            if (!PermissionPreHandlers.hasEveryPermission(request, requiredPermissions)) {
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
        if (error instanceof NauliteApiError) {
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

        httpLog.error("request failed: %O", error);
        reply.code(500);
        return {
            message: error instanceof Error ? error.message : "Internal server error."
        };
    });

    await registerRoutes(app);
    return app;
}
