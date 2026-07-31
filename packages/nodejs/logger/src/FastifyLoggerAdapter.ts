import { format } from "node:util";
import type { FastifyBaseLogger } from "fastify";

import type winston from "winston";

import type { LogLevel } from "./format";

/**
 * Fastify bootstrap options for wiring a custom Winston logger.
 */
export type FastifyLoggerBootstrapOptions =
    | { readonly logger: false }
    | { readonly loggerInstance: FastifyBaseLogger };

/**
 * Adapts a Winston logger to the Fastify logger interface.
 *
 * @param logger Winston logger instance
 * @returns Fastify-compatible logger
 */
export function toFastifyLogger(logger: winston.Logger): FastifyBaseLogger {
    const write = (level: LogLevel, args: unknown[]): void => {
        if (args.length === 0) {
            logger.log(level, "");
            return;
        }

        if (args.length === 1) {
            if (typeof args[0] === "string") {
                logger.log(level, args[0]);
                return;
            }

        if (typeof args[0] === "object" && args[0] !== null) {
            const record = args[0] as Record<string, unknown>;
            const responseTime = record.responseTime;
            const res = record.res as { statusCode?: number } | undefined;

            if (res && typeof responseTime === "number") {
                logger.log(level, "request completed status=%d responseTime=%d", res.statusCode ?? 0, responseTime);
                return;
            }

            const err = record.err ?? record.error;

                if (err !== undefined) {
                    logger.log(level, format("%O", err));
                    return;
                }

                logger.log(level, format("%o", record));
                return;
            }

            logger.log(level, String(args[0]));
            return;
        }

        if (typeof args[0] === "object" && args[0] !== null && typeof args[1] === "string") {
            const record = args[0] as Record<string, unknown>;
            const err = record.err ?? record.error;
            const suffix = err !== undefined ? format(" %O", err) : format(" %o", record);

            logger.log(level, `${args[1]}${suffix}`);
            return;
        }

        logger.log(level, format(...args as [unknown, ...unknown[]]));
    };

    const fastifyLogger: FastifyBaseLogger = {
        level: logger.level,
        silent: () => undefined,
        trace: (...args: unknown[]) => write("debug", args),
        debug: (...args: unknown[]) => write("debug", args),
        info: (...args: unknown[]) => write("info", args),
        warn: (...args: unknown[]) => write("warn", args),
        error: (...args: unknown[]) => write("error", args),
        fatal: (...args: unknown[]) => write("error", args),
        child: () => fastifyLogger
    };

    return fastifyLogger;
}

/**
 * Builds Fastify logger bootstrap options for a Winston logger.
 *
 * Fastify 5 requires custom logger instances via `loggerInstance`, not `logger`.
 *
 * @param logger Winston logger instance
 * @param enabled Whether HTTP logging should be enabled
 * @returns Fastify server logger options
 */
export function createFastifyLoggerOptions(
    logger: winston.Logger,
    enabled = true
): FastifyLoggerBootstrapOptions {
    if (!enabled) {
        return { logger: false };
    }

    return { loggerInstance: toFastifyLogger(logger) };
}
