import { z } from "zod";

/**
 * Liveness probe response payload.
 */
export const HealthLiveResponseSchema = z.object({
    status: z.literal("ok")
});
