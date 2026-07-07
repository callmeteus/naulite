import { z } from "zod";

import { LooseObjectSchema } from "./LooseObjectSchema";

/**
 * NetBird group ensure response payload.
 */
export const NetBirdGroupResponseSchema = z.object({
    group: LooseObjectSchema
});
