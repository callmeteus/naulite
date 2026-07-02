import { z } from "zod";

/**
 * Platform metadata exposed under /.well-known/platform.
 */
export const PlatformMetadataResponseSchema = z.object({
    name: z.string(),
    version: z.string(),
    authRequired: z.boolean(),
    defaultPort: z.number().int(),
    localBypass: z.boolean()
});
