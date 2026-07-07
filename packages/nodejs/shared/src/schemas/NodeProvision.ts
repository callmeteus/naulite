import { z } from "zod";

import { ClusterLabelsSchema } from "./ClusterLabels";
import { TimestampSchema } from "./Common";

/**
 * Lifecycle status for a control-plane node provision request.
 */
export const NodeProvisionStatusSchema = z.enum([
    "pending",
    "launching",
    "bootstrapping",
    "registered",
    "failed",
    "terminated"
]);

/**
 * Persisted node provision request tracked by the control plane.
 */
export const NodeProvisionSchema = z.object({
    id: z.string().min(1),
    provider: z.string().min(1),
    cloudInstanceId: z.string().min(1).optional(),
    status: NodeProvisionStatusSchema,
    nodeId: z.string().min(1).optional(),
    instanceType: z.string().min(1),
    amiId: z.string().min(1),
    labels: ClusterLabelsSchema.default({}),
    capabilities: z.array(z.string()).default([]),
    region: z.string().min(1).optional(),
    error: z.string().optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
