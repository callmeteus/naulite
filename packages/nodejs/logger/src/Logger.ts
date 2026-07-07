import { createRequire } from "node:module";
import path from "node:path";
import { format } from "node:util";

import winston from "winston";
import type TransportStream from "winston-transport";

import { formatLogLine, formatLogTimestamp, type LogLevel } from "./format";

const require = createRequire(import.meta.url);
const DailyRotateFile = require("winston-daily-rotate-file") as typeof import("winston-daily-rotate-file");

const LOG_LEVELS: Record<LogLevel, number> = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
};

const loggerCache = new Map<string, winston.Logger>();

/**
 * Resolves the minimum log level from environment.
 *
 * @returns Configured log level
 */
function resolveLogLevel(): LogLevel {
    const configured = process.env.NAULITE_LOG_LEVEL?.toLowerCase();

    if (configured === "error" || configured === "warn" || configured === "info" || configured === "debug") {
        return configured;
    }

    return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Resolves the directory for rotated log files.
 *
 * @returns Absolute or relative log directory path
 */
function resolveLogDir(): string {
    return process.env.NAULITE_LOG_DIR ?? "./logs";
}

/**
 * Whether file transports should be enabled.
 *
 * @returns True when file logging is allowed
 */
function shouldUseFileTransport(): boolean {
    return process.env.VITEST !== "true" && process.env.NAULITE_LOG_DISABLE_FILE !== "1";
}

const splatSymbol = Symbol.for("splat");

/**
 * Creates Winston transports for a named logger.
 *
 * @param service Service identifier
 * @param name Module logger name
 * @returns Configured transports
 */
function createTransports(service: string, name: string): TransportStream[] {
    const printfFormat = winston.format.printf((info) => {
        const level = String(info.level) as LogLevel;
        let message = typeof info.message === "string" ? info.message : String(info.message);
        const splat = info[splatSymbol as keyof typeof info] as unknown[] | undefined;

        if (splat && splat.length > 0) {
            message = format(message, ...splat);
        }

        return formatLogLine({
            timestamp: formatLogTimestamp(),
            service,
            module: name,
            level,
            message
        });
    });

    const logFormat = winston.format.combine(winston.format.splat(), printfFormat);

    const transports: TransportStream[] = [
        new winston.transports.Console({ format: logFormat })
    ];

    if (shouldUseFileTransport()) {
        const maxFiles = process.env.NAULITE_LOG_MAX_FILES ?? "14";
        const maxSize = process.env.NAULITE_LOG_MAX_SIZE ?? "20m";
        const logDir = resolveLogDir();
        const filename = path.join(logDir, `${service}-${name}-%DATE%.log`);

        const rotateTransport = new DailyRotateFile({
            filename,
            datePattern: "YYYY-MM-DD",
            maxFiles,
            maxSize,
            zippedArchive: false,
            format: logFormat
        });

        rotateTransport.on("error", (err: Error) => {
            process.stderr.write(`[logger] rotate transport error: ${err.message}\n`);
        });

        transports.push(rotateTransport);
    }

    return transports;
}

/**
 * Platform logger factory with per-module instances and log rotation.
 */
export namespace Logger {
    /**
     * Creates or returns a cached Winston logger for a service module.
     *
     * @param service Service identifier (e.g. control-plane)
     * @param name Module logger name
     * @returns Configured Winston logger
     */
    export function create(service: string, name: string): winston.Logger {
        const cacheKey = `${service}:${name}`;
        const cached = loggerCache.get(cacheKey);

        if (cached) {
            return cached;
        }

        const level = resolveLogLevel();
        const logger = winston.createLogger({
            levels: LOG_LEVELS,
            level,
            transports: createTransports(service, name)
        });

        loggerCache.set(cacheKey, logger);
        return logger;
    }

    /**
     * Clears cached loggers. Intended for tests.
     *
     * @returns Nothing
     */
    export function resetForTests(): void {
        for (const logger of loggerCache.values()) {
            logger.close();
        }

        loggerCache.clear();
    }
}
