import { z } from "zod";

/**
 * Request body for GitOps webhook routes.
 */
export const GitOpsWebhookBodySchema = z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().min(1).default("main"),
    commitSha: z.string().min(1).optional(),
    revision: z.string().min(1).optional(),
    overlayPaths: z.array(z.string().min(1)).default([]),
    manifestPath: z.string().min(1).default("compose.yaml"),
    repositoryFullName: z.string().min(1).optional(),
    ref: z.string().min(1).optional(),
    deliveryId: z.string().min(1).optional(),
    deleted: z.boolean().optional(),
    event: z.enum(["push", "delete"]).optional(),
    vars: z.record(z.string(), z.string()).optional()
});
