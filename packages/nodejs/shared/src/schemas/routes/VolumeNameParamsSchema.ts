import { z } from "zod";

/**
 * Path params for volume backup routes.
 */
export const VolumeNameParamsSchema = z.object({
    volumeName: z.string().min(1)
});
