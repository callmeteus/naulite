import { z } from "zod";

import { LifecycleStatusSchema, TimestampSchema } from "./Common.js";
import { ClusterPlacementSchema } from "./ClusterLabels.js";
import { IngressSchema } from "./Ingress.js";
import { LogRotationPolicySchema } from "./LogRotationTask.js";

/**
 * Desired service state managed by the control plane.
 */
export const ServiceStatusSchema = z.enum([
    "pending",
    "deploying",
    "running",
    "degraded",
    "stopped",
    "failed"
]);

/**
 * Platform service definition derived from a manifest.
 */
export const ServiceSchema = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    manifestName: z.string().min(1),
    image: z.string().min(1),
    desiredReplicas: z.number().int().nonnegative(),
    status: ServiceStatusSchema,
    cluster: ClusterPlacementSchema.optional(),
    capabilities: z.array(z.string()).default([]),
    networks: z.array(z.string()).default([]),
    ingress: IngressSchema.optional(),
    logRotation: LogRotationPolicySchema.optional(),
    lifecycleStatus: LifecycleStatusSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
