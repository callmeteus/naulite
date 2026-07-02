import { z } from "zod";

import { TimestampSchema } from "./Common.js";

/**
 * Cluster secret metadata. Values are never exposed in list APIs.
 */
export const SecretSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    keys: z.array(z.string().min(1)).min(1),
    scope: z.enum(["cluster", "service"]).default("cluster"),
    serviceName: z.string().min(1).optional(),
    description: z.string().optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
