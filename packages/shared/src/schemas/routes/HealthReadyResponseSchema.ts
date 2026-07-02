import { z } from "zod";

/**
 * Readiness probe response payload.
 */
export const HealthReadyResponseSchema = z.object({
    ready: z.boolean()
});
