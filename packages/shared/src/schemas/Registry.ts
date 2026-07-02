import { z } from "zod";

import { SecretReferenceSchema, TimestampSchema } from "./Common";

/**
 * Container registry configuration declared in a manifest.
 */
export const RegistrySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url(),
    isDefault: z.boolean().default(false),
    credentialsSecret: SecretReferenceSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
