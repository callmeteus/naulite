import { z } from "zod";

import { LifecycleStatusSchema, ResourceRequirementsSchema, TimestampSchema } from "./Common";

/**
 * Runtime status for a single service instance on a node.
 */
export const InstanceStatusSchema = z.enum([
    "pending",
    "pulling",
    "creating",
    "starting",
    "running",
    "stopping",
    "stopped",
    "removing",
    "failed"
]);

/**
 * Health probe result for a running instance.
 */
export const InstanceHealthSchema = z.object({
    healthy: z.boolean(),
    message: z.string().optional(),
    checkedAt: TimestampSchema
});

/**
 * Scheduled workload instance executed by an agent.
 */
export const InstanceSchema = z.object({
    id: z.string().min(1),
    serviceId: z.string().min(1),
    serviceName: z.string().min(1),
    nodeId: z.string().min(1),
    status: InstanceStatusSchema,
    containerId: z.string().min(1).optional(),
    image: z.string().min(1),
    resources: ResourceRequirementsSchema.optional(),
    health: InstanceHealthSchema.optional(),
    lifecycleStatus: LifecycleStatusSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
