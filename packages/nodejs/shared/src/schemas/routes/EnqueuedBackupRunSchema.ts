import { z } from "zod";

/**
 * Backup run created when a volume backup is enqueued.
 */
export const EnqueuedBackupRunSchema = z.object({
    id: z.string().min(1),
    volumeName: z.string().min(1),
    status: z.literal("pending"),
    startedAt: z.string()
});
