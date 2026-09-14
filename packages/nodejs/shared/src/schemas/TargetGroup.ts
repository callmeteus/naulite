import { z } from "zod";

import { PaginationQuerySchema } from "./Pagination";

/**
 * Target group membership row (node id attached to a group).
 */
export const TargetGroupMemberSchema = z.object({
    nodeId: z.string().min(1)
});

/**
 * Persisted target group with explicit node membership.
 */
export const TargetGroupSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    memberNodeIds: z.array(z.string().min(1)).default([]),
    createdAt: z.string(),
    updatedAt: z.string()
});

/**
 * Body for creating a target group.
 */
export const CreateTargetGroupBodySchema = z.object({
    id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
    name: z.string().min(1),
    memberNodeIds: z.array(z.string().min(1)).default([])
});

/**
 * Body for updating a target group.
 */
export const UpdateTargetGroupBodySchema = z.object({
    name: z.string().min(1).optional(),
    memberNodeIds: z.array(z.string().min(1)).optional()
});

/**
 * Query parameters for listing target groups.
 */
export const TargetGroupListQuerySchema = PaginationQuerySchema;

export type TargetGroup = z.infer<typeof TargetGroupSchema>;
export type CreateTargetGroupBody = z.infer<typeof CreateTargetGroupBodySchema>;
export type UpdateTargetGroupBody = z.infer<typeof UpdateTargetGroupBodySchema>;
