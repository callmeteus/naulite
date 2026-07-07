import { z } from "zod";

/**
 * Path params for a container registry image name and tag.
 */
export const CrImageNameTagParamsSchema = z.object({
    name: z.string().min(1),
    tag: z.string().min(1)
});
