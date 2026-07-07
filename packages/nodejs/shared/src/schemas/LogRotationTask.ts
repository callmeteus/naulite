import { z } from "zod";

import { CronExpressionSchema, GlobPatternSchema, TimestampSchema } from "./Common";

/**
 * Log rotation policy attached to a service or cluster default.
 */
export const LogRotationPolicySchema = z.object({
    schedule: CronExpressionSchema,
    paths: z.array(z.string().min(1)).min(1),
    maxSizeMb: z.number().int().positive().optional(),
    maxFiles: z.number().int().positive().optional(),
    compress: z.boolean().default(false),
    includes: z.array(GlobPatternSchema).default([]),
    excludes: z.array(GlobPatternSchema).default([])
});

/**
 * Status for a log rotation run dispatched to an agent.
 */
export const LogRotationTaskStatusSchema = z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled"
]);

/**
 * Log rotation task payload sent from the control plane to an agent.
 */
export const LogRotationTaskSchema = z.object({
    taskId: z.string().min(1),
    instanceId: z.string().min(1),
    serviceName: z.string().min(1),
    nodeId: z.string().min(1),
    policy: LogRotationPolicySchema,
    status: LogRotationTaskStatusSchema.default("pending"),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
    rotatedFiles: z.array(z.string()).default([]),
    errorMessage: z.string().optional()
});
