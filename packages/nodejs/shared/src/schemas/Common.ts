import { z } from "zod";

/**
 * Cron schedule expression (five-field cron syntax).
 */
export const CronExpressionSchema = z.string().min(1);

/**
 * Glob pattern for include or exclude filters.
 */
export const GlobPatternSchema = z.string().min(1);

/**
 * Reference to a cluster secret by name and optional key.
 */
export const SecretReferenceSchema = z.object({
    secretName: z.string().min(1),
    key: z.string().min(1).optional()
});

/**
 * CPU, memory, and disk resource quantities for scheduling.
 */
export const ResourceRequirementsSchema = z.object({
    cpuMillis: z.number().int().nonnegative().optional(),
    memoryMb: z.number().int().nonnegative().optional(),
    diskMb: z.number().int().nonnegative().optional()
});

/**
 * Retention policy for backups and rotated artifacts.
 */
export const RetentionPolicySchema = z.object({
    maxCount: z.number().int().positive().optional(),
    maxAgeDays: z.number().int().positive().optional()
});

/**
 * Resolved secret material passed to agents after control plane filtering.
 */
export const ResolvedSecretSchema = z.object({
    name: z.string().min(1),
    data: z.record(z.string(), z.string())
});

/**
 * Generic lifecycle status shared across cluster resources.
 */
export const LifecycleStatusSchema = z.enum([
    "pending",
    "running",
    "stopped",
    "failed",
    "unknown"
]);

/**
 * ISO-8601 timestamp string.
 */
export const TimestampSchema = z.string().datetime({ offset: true });

/**
 * Human-friendly duration string.
 *
 * Supported v1 units:
 * - s (seconds)
 * - m (minutes)
 * - h (hours)
 *
 * Examples: "30s", "1m", "2h"
 */
export const DurationSchema = z
    .string()
    .min(2)
    .regex(/^\d+(s|m|h)$/, "Invalid duration format. Expected e.g. \"30s\" or \"1m\".");
