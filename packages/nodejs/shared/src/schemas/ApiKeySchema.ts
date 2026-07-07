import { z } from "zod";

/**
 * Metadata for a panel-generated CLI API key (secret value is never stored).
 */
export const ApiKeySchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    prefix: z.string().min(1),
    createdAt: z.string().min(1),
    lastUsedAt: z.string().nullable().optional(),
    revokedAt: z.string().nullable().optional()
});

/**
 * Response returned once when a new API key is created.
 */
export const CreatedApiKeySchema = ApiKeySchema.extend({
    secret: z.string().min(1)
});

/**
 * Request body for creating a new API key.
 */
export const CreateApiKeyBodySchema = z.object({
    name: z.string().min(1).max(120)
});
