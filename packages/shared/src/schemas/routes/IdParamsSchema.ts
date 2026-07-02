import { z } from "zod";

/**
 * Path params with a resource id.
 */
export const IdParamsSchema = z.object({
    id: z.string().min(1)
});
