import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { formatValidationDetails } from "@naulite/shared";

import { Logger } from "../Logger";
import { TreatedError } from "./TreatedError";
import { ComposeParserError } from "./orchestration/compose/ComposeParserError";

const log = Logger.create("http");

/**
 * Registers the control plane global Fastify error handler.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export function registerErrorHandler(app: FastifyInstance): void {
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof TreatedError) {
            reply.code(error.statusCode);
            return error.toResponseBody();
        }

        if (error instanceof ComposeParserError) {
            reply.code(error.statusCode);
            return {
                code: error.code,
                message: error.message,
                details: error.details
            };
        }

        if (
            typeof error === "object"
            && error !== null
            && "code" in error
            && (error as { code: string }).code === "FST_ERR_VALIDATION"
        ) {
            const validationError = error as {
                validation?: unknown;
                validationContext?: string;
            };

            const details = {
                validation: validationError.validation,
                validationContext: validationError.validationContext
            };

            const formatted = formatValidationDetails(details);
            reply.code(400);
            return {
                message: formatted ? `Validation failed: ${formatted}` : "Validation failed.",
                code: "validation_failed",
                details
            };
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

        log.error("request failed: %O", error);
        reply.code(500);
        return {
            message: error instanceof Error ? error.message : "Internal server error."
        };
    });
}
