import { z } from "zod";

/**
 * Request body for creating or updating a cluster secret.
 */
export const UpsertSecretBodySchema = z.object({
    name: z.string().min(1).optional(),
    data: z.record(z.string().min(1), z.string()),
    scope: z.enum(["cluster", "service"]).default("cluster"),
    serviceName: z.string().min(1).optional(),
    description: z.string().optional()
});
