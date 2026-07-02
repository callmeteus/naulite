import { z } from "zod";

/**
 * Optional manifest name filter for list routes.
 */
export const ManifestNameQuerySchema = z.object({
    manifestName: z.string().min(1).optional()
});
