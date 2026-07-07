import { z } from "zod";

/**
 * Request body for NetBird group ensure routes.
 */
export const EnsureNetBirdGroupBodySchema = z.object({
    name: z.string().min(1)
});
