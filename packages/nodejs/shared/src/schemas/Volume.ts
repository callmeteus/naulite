import { z } from "zod";

import { TimestampSchema } from "./Common";
import { VolumeBackupPolicySchema } from "./BackupTask";

/**
 * Cluster-scoped volume lifecycle status.
 */
export const VolumeStatusSchema = z.enum([
    "pending",
    "bound",
    "available",
    "failed",
    "deleting"
]);

/**
 * Persistent volume managed by the control plane.
 */
export const VolumeSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    manifestName: z.string().min(1),
    scope: z.enum(["cluster", "node"]).default("cluster"),
    nodeId: z.string().min(1).optional(),
    mountPath: z.string().min(1),
    sizeMb: z.number().int().positive().optional(),
    status: VolumeStatusSchema,
    backup: VolumeBackupPolicySchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
