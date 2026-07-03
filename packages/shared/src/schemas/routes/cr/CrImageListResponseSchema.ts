import { z } from "zod";

import { ContainerRegistryImageSchema } from "../../ContainerRegistry";

/**
 * Response body for GET /cr/images.
 */
export const CrImageListResponseSchema = z.object({
    images: z.array(ContainerRegistryImageSchema)
});
