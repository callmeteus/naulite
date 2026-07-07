import { z } from "zod";

/**
 * Path params for GitOps rollback routes.
 */
export const RevisionIdParamsSchema = z.object({
    revisionId: z.string().min(1)
});
