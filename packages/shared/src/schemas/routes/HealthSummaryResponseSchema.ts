import { z } from "zod";

/**
 * Aggregated health summary response payload.
 */
export const HealthSummaryResponseSchema = z.object({
    status: z.enum(["healthy", "degraded", "unhealthy"]),
    controlPlaneId: z.string(),
    nodeCount: z.number().int(),
    serviceCount: z.number().int(),
    database: z.enum(["up", "down"]),
    timestamp: z.string()
});
