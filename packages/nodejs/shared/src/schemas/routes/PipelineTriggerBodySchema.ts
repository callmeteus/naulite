import { z } from "zod";

/**
 * Request body for manual pipeline triggers.
 */
export const PipelineTriggerBodySchema = z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().min(1).default("main"),
    commitSha: z.string().min(1).optional(),
    manifestPath: z.string().min(1).default("compose.yaml"),
    repositoryFullName: z.string().min(1).optional(),
    overlayPaths: z.array(z.string().min(1)).default([]),
    vars: z.record(z.string()).default({})
});
