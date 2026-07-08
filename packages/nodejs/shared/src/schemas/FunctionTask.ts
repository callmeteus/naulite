import { z } from "zod";

import { ResolvedSecretSchema, TimestampSchema } from "./Common";

export const FunctionTaskStatusSchema = z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "timed_out",
    "cancelled"
]);

export const FunctionTaskSchema = z.object({
    taskId: z.string().min(1),
    manifestName: z.string().min(1),
    serviceName: z.string().min(1),
    image: z.string().min(1),
    command: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
    secrets: z.array(ResolvedSecretSchema).default([]),
    networks: z.array(z.string()).default([]),
    volumeMounts: z.array(z.object({
        volumeName: z.string().min(1),
        mountPath: z.string().min(1),
        readOnly: z.boolean().default(false)
    })).default([]),
    timeoutMs: z.number().int().positive(),
    runId: z.string().min(1).optional(),
    triggeredBy: z.enum(["api", "cli", "cron", "http"]).default("api"),
    triggeredAt: TimestampSchema.default(() => new Date().toISOString()),
    payload: z.unknown().optional()
});

export const FunctionTaskResultSchema = z.object({
    taskId: z.string().min(1),
    status: FunctionTaskStatusSchema,
    exitCode: z.number().int().optional(),
    logs: z.string().optional(),
    timedOut: z.boolean().default(false),
    error: z.string().optional()
});

