import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { createFastifyLoggerOptions } from "@naulite/logger";
import { NauliteApiError, NauliteClient } from "@naulite/sdk";
import { enrichApiErrorMessage, formatValidationDetails } from "@naulite/shared";

import { createBffError, isBffError, toBffErrorResponse } from "./errors/BffError";
import { resolveConfigFromEnv } from "./Config";
import { Logger } from "./Logger";
import { AuthPreHandlers } from "./auth/AuthPreHandlers";
import { CsrfProtection } from "./auth/CsrfProtection";
import {
    PermissionPreHandlers,
    resolveBffRoutePermissions
} from "./auth/PermissionPreHandlers";
import { registerRoutes } from "./routes/index";

/**
 * Options for creating the admin API Fastify application.
 */
export interface CreateAppOptions {
    controlPlaneInstances?: string[];
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
    const controlPlaneInstances = options.controlPlaneInstances ?? envConfig.controlPlaneInstances;
    const controlPlane = new NauliteClient({
        baseUrl: controlPlaneInstances[0] ?? "http://localhost:18080",
        controlPlaneInstances,
        token: options.adminApiKey ?? envConfig.adminApiKey
    });

    const httpLog = Logger.create("http");
    const app = Fastify({
        ...createFastifyLoggerOptions(httpLog, options.logger !== false)
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

            return reply.code(statusCode).send(
                isBffError(error)
                    ? toBffErrorResponse(error)
                    : toBffErrorResponse(createBffError(statusCode, "errors.unauthorized"))
            );
        }
    });

    app.addHook("preHandler", async (request, reply) => {
        if (AuthPreHandlers.isPublicRoute(request.url, request.method)) {
            return;
        }

        if (CsrfProtection.requiresValidation(request) && !CsrfProtection.isValid(request)) {
            return reply.code(403).send(toBffErrorResponse(createBffError(403, "errors.csrfInvalid")));
        }

        const path = request.url.split("?")[0] ?? request.url;
        const method = request.method.toUpperCase();
        const requiredPermissions = resolveBffRoutePermissions(path, method);

        try {
            if (!PermissionPreHandlers.hasEveryPermission(request, requiredPermissions)) {
                throw createBffError(403, "errors.insufficientPermission");
            }
        } catch (error) {
            const statusCode = error instanceof Error && "statusCode" in error
                ? Number((error as Error & { statusCode: number }).statusCode)
                : 403;

            return reply.code(statusCode).send(
                isBffError(error)
                    ? toBffErrorResponse(error)
                    : toBffErrorResponse(createBffError(statusCode, "errors.insufficientPermission"))
            );
        }
    });

    app.setErrorHandler((error: unknown, _request, reply) => {
        if (error instanceof NauliteApiError) {
            const statusCode = error.status;

            if (error.i18n) {
                reply.code(statusCode);
                return toBffErrorResponse(createBffError(statusCode, error.i18n, {
                    code: error.code,
                    i18nParams: error.i18nParams
                }));
            }

            const details = error.details;
            reply.code(statusCode);
            return {
                message: enrichApiErrorMessage(error.message, details),
                code: error.code,
                details
            };
        }

        if (isBffError(error)) {
            reply.code(error.statusCode);
            return toBffErrorResponse(error);
        }

        if (error instanceof z.ZodError) {
            const formatted = formatValidationDetails(error.issues);
            reply.code(400);
            return {
                message: formatted ? `Validation failed: ${formatted}` : "Validation failed.",
                code: "validation_failed",
                details: error.issues
            };
        }

        if (error instanceof Error && "issues" in error) {
            const issues = (error as Error & { issues?: unknown }).issues;
            const formatted = formatValidationDetails(issues);
            reply.code(400);
            return {
                message: formatted ? `Validation failed: ${formatted}` : "Validation failed.",
                code: "validation_failed",
                details: issues ?? error
            };
        }

        if (error instanceof Error && "statusCode" in error) {
            const statusCode = Number((error as Error & { statusCode: number }).statusCode);
            reply.code(statusCode);

            if (isBffError(error)) {
                return toBffErrorResponse(error);
            }

            return toBffErrorResponse(createBffError(statusCode, "errors.generic"));
        }

        httpLog.error("request failed: %O", error);
        reply.code(500);
        return toBffErrorResponse(createBffError(500, "errors.internal"));
    });

    await registerRoutes(app);
    return app;
}
