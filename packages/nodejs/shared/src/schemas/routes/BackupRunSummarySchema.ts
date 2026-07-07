import { z } from "zod";

/**
 * Backup run summary returned by the control plane store.
 */
export const BackupRunSummarySchema = z.object({
    id: z.string().min(1),
    volumeName: z.string().min(1),
    status: z.enum(["pending", "running", "succeeded", "failed"]),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    destination: z.string().optional()
});
