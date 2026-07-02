import { z } from "zod";

/**
 * Optional filters for instance list routes.
 */
export const InstanceListQuerySchema = z.object({
    serviceName: z.string().min(1).optional(),
    nodeId: z.string().min(1).optional()
});
