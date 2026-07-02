import { z } from "zod";

import { LooseObjectArraySchema } from "./LooseObjectArraySchema";

/**
 * GitOps revision list response payload.
 */
export const GitOpsRevisionListResponseSchema = z.object({
    revisions: LooseObjectArraySchema
});
