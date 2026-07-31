import { format } from "node:util";

/**
 * Summarizes a Fastify log record without dumping sockets, parsers, or reply internals.
 *
 * @param record Fastify log object (req/res/err/responseTime)
 * @returns Single-line message safe for terminal output
 */
export function summarizeFastifyLogRecord(record: Record<string, unknown>): string {
    const parts: string[] = [];

    const req = record.req;

    if (typeof req === "object" && req !== null) {
        const method = (req as { method?: string }).method;
        const url = (req as { url?: string }).url;

        if (method || url) {
            parts.push(`${method ?? "?"} ${url ?? "/"}`);
        }
    }

    const res = record.res;

    if (typeof res === "object" && res !== null) {
        const statusCode = (res as { statusCode?: number }).statusCode;

        if (typeof statusCode === "number") {
            parts.push(`status=${statusCode}`);
        }
    }

    if (typeof record.responseTime === "number") {
        parts.push(`responseTime=${record.responseTime.toFixed(2)}ms`);
    }

    const err = record.err ?? record.error;

    if (err instanceof Error) {
        parts.push(err.message);
    } else
    if (typeof err === "object" && err !== null && "message" in err) {
        parts.push(String((err as { message: unknown }).message));
    }

    if (parts.length > 0) {
        return parts.join(" ");
    }

    const keys = Object.keys(record);

    if (keys.length > 0) {
        return `fastify log keys=${keys.join(",")}`;
    }

    return format("%j", record);
}
