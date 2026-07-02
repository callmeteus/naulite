import { z } from "zod";

import { LooseObjectArraySchema } from "./LooseObjectArraySchema";

/**
 * NetBird group list response payload.
 */
export const NetBirdGroupsListResponseSchema = z.object({
    groups: LooseObjectArraySchema
});
