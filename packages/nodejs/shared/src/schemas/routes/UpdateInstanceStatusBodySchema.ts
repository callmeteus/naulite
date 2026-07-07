import { z } from "zod";

/**
 * Request body for instance status update routes.
 */
export const UpdateInstanceStatusBodySchema = z.object({
    status: z.enum(["pending", "running", "stopped", "failed"]),
    containerId: z.string().min(1).optional(),
    health: z.object({
        healthy: z.boolean(),
        checkedAt: z.string().min(1),
        message: z.string().optional()
    }).optional()
});
