import { z } from "zod";

/**
 * Path params for backup restore routes.
 */
export const BackupIdParamsSchema = z.object({
    backupId: z.string().min(1)
});
