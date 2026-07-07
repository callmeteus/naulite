import type { FastifyInstance } from "fastify";

import { ComposeParserError } from "./orchestration/compose/ComposeParserError";
import { Logger } from "../Logger";
import { TreatedError } from "./TreatedError";

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
            reply.code(400);
            return {
                message: "Validation failed.",
                details: (error as { validation?: unknown }).validation
            };
        }

        if (error instanceof Error && "issues" in error) {
            reply.code(400);
            return {
                message: "Validation failed.",
                details: error
            };
        }

        log.error("request failed: %O", error);
        reply.code(500);
        return {
            message: error instanceof Error ? error.message : "Internal server error."
        };
    });
}
