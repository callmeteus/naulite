import { z } from "zod";

/**
 * Query params for secret operations addressed by name.
 */
export const SecretNameQuerySchema = z.object({
    name: z.string().min(1)
});
