import { z } from "zod";

/**
 * Naulite metadata exposed under /.well-known/naulite.
 */
export const NauliteMetadataResponseSchema = z.object({
    name: z.string(),
    version: z.string(),
    authRequired: z.boolean(),
    defaultPort: z.number().int(),
    localBypass: z.boolean()
});
