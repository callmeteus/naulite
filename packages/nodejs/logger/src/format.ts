/**
 * Cross-language log line format shared with the Zig agent logger.
 *
 * Pattern: {timestamp} [{service}] [{module}] {level}: {message}
 */
export const LOG_LINE_PATTERN =
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} \[[^\]]+\] \[[^\]]+\] (error|warn|info|debug): /;

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogLineParts {
    timestamp: string;
    service: string;
    module: string;
    level: LogLevel;
    message: string;
}

/**
 * Formats a single log line using the platform-wide contract.
 *
 * @param parts Structured log fields
 * @returns Formatted log line
 */
export function formatLogLine(parts: LogLineParts): string {
    return `${parts.timestamp} [${parts.service}] [${parts.module}] ${parts.level}: ${parts.message}`;
}

/**
 * Formats the current local timestamp as YYYY-MM-DD HH:mm:ss.SSS.
 *
 * @param date Optional date to format (defaults to now)
 * @returns Timestamp string
 */
export function formatLogTimestamp(date: Date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const millis = String(date.getMilliseconds()).padStart(3, "0");

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${millis}`;
}
