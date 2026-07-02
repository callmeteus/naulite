import { z } from "zod";

import {
    CronExpressionSchema,
    GlobPatternSchema,
    RetentionPolicySchema,
    SecretReferenceSchema,
    TimestampSchema
} from "./Common.js";

/**
 * Backup destination for the built-in local provider.
 */
export const LocalBackupDestinationSchema = z.object({
    provider: z.literal("local"),
    path: z.string().min(1)
});

/**
 * Backup destination that streams archives to another node.
 */
export const NodeBackupDestinationSchema = z.object({
    provider: z.literal("node"),
    nodeId: z.string().min(1),
    path: z.string().min(1)
});

/**
 * Backup destination backed by an S3-compatible object store plugin.
 */
export const S3BackupDestinationSchema = z.object({
    provider: z.literal("s3"),
    bucket: z.string().min(1),
    prefix: z.string().default(""),
    region: z.string().min(1),
    endpoint: z.string().optional(),
    credentialsSecret: SecretReferenceSchema
});

/**
 * Backup destination backed by a registered plugin provider.
 */
export const PluginBackupDestinationSchema = z.object({
    provider: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({})
});

/**
 * Volume backup policy declared in a manifest.
 */
export const VolumeBackupPolicySchema = z.object({
    schedule: CronExpressionSchema,
    includes: z.array(GlobPatternSchema).default([]),
    excludes: z.array(GlobPatternSchema).default([]),
    retention: RetentionPolicySchema.optional(),
    destination: z.union([
        LocalBackupDestinationSchema,
        NodeBackupDestinationSchema,
        S3BackupDestinationSchema,
        PluginBackupDestinationSchema
    ])
});

/**
 * Status for a backup run dispatched to an agent.
 */
export const BackupTaskStatusSchema = z.enum([
    "pending",
    "running",
    "completed",
    "failed",
    "cancelled"
]);

/**
 * Backup task payload sent from the control plane to an agent.
 */
export const BackupTaskSchema = z.object({
    taskId: z.string().min(1),
    volumeId: z.string().min(1),
    volumeName: z.string().min(1),
    nodeId: z.string().min(1),
    includes: z.array(GlobPatternSchema).default([]),
    excludes: z.array(GlobPatternSchema).default([]),
    retention: RetentionPolicySchema.optional(),
    destination: z.union([
        LocalBackupDestinationSchema,
        NodeBackupDestinationSchema,
        S3BackupDestinationSchema,
        PluginBackupDestinationSchema
    ]),
    resolvedSecrets: z.record(z.string(), z.string()).default({}),
    status: BackupTaskStatusSchema.default("pending"),
    startedAt: TimestampSchema.optional(),
    completedAt: TimestampSchema.optional(),
    errorMessage: z.string().optional()
});
