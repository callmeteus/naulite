import { z } from "zod";

/**
 * Request body for service build routes.
 */
export const BuildServiceBodySchema = z.object({
    serviceName: z.string().min(1),
    provider: z.string().min(1).optional(),
    registry: z.string().min(1).optional()
});

/**
 * Query parameters for async build routes.
 */
export const BuildWaitQuerySchema = z.object({
    wait: z.enum(["true", "false"]).optional()
});
