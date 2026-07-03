import { z } from "zod";

/**
 * Response body for DELETE /cr/images/:name/:tag.
 */
export const CrImageDeleteResponseSchema = z.object({
    deleted: z.literal(true),
    name: z.string().min(1),
    tag: z.string().min(1)
});
