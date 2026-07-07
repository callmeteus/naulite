import { describe, expect, it, afterEach } from "vitest";

import {
    createFastifyLoggerOptions,
    formatLogLine,
    LOG_LINE_PATTERN,
    Logger,
    toFastifyLogger
} from "@naulite/logger";

describe("@naulite/logger", () => {
    afterEach(() => {
        Logger.resetForTests();
        delete process.env.NAULITE_LOG_DISABLE_FILE;
        delete process.env.VITEST;
    });

    it("formatLogLine matches the cross-language contract", () => {
        const line = formatLogLine({
            timestamp: "2025-07-05 08:27:00.123",
            service: "control-plane",
            module: "apply",
            level: "debug",
            message: "schedule failed service=foo nodes=2"
        });

        expect(line).toBe(
            "2025-07-05 08:27:00.123 [control-plane] [apply] debug: schedule failed service=foo nodes=2"
        );
        expect(LOG_LINE_PATTERN.test(line)).toBe(true);
    });

    it("create returns the same logger instance for the same service and module", () => {
        const first = Logger.create("control-plane", "apply");
        const second = Logger.create("control-plane", "apply");
        const other = Logger.create("control-plane", "gateway");

        expect(first).toBe(second);
        expect(first).not.toBe(other);
    });

    it("does not create file transports during vitest", () => {
        process.env.VITEST = "true";

        const logger = Logger.create("control-plane", "test");

        expect(logger.transports.some((transport) => transport.constructor.name === "DailyRotateFile")).toBe(false);
        expect(logger.transports.some((transport) => transport.constructor.name === "Console")).toBe(true);
    });

    it("builds Fastify logger bootstrap options with loggerInstance", () => {
        const options = createFastifyLoggerOptions(Logger.create("ui-backend", "http"));

        expect(options).toEqual({
            loggerInstance: expect.objectContaining({
                info: expect.any(Function),
                error: expect.any(Function)
            })
        });
    });

    it("disables Fastify logging when bootstrap is disabled", () => {
        expect(createFastifyLoggerOptions(Logger.create("ui-backend", "http"), false)).toEqual({
            logger: false
        });
    });

    it("exposes Fastify-compatible logger methods", () => {
        const fastifyLogger = toFastifyLogger(Logger.create("ui-backend", "http"));

        expect(typeof fastifyLogger.info).toBe("function");
        expect(typeof fastifyLogger.error).toBe("function");
        expect(typeof fastifyLogger.debug).toBe("function");
        expect(typeof fastifyLogger.warn).toBe("function");
        expect(typeof fastifyLogger.child).toBe("function");
        expect(fastifyLogger.child({})).toBe(fastifyLogger);
    });
});
