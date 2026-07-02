import { z } from "zod";

/**
 * Path params with a resource name.
 */
export const NameParamsSchema = z.object({
    name: z.string().min(1)
});
