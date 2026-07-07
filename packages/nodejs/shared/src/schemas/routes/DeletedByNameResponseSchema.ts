import { z } from "zod";

/**
 * Successful delete-by-name response.
 */
export const DeletedByNameResponseSchema = z.object({
    deleted: z.literal(true),
    name: z.string()
});
