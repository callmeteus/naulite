import { z } from "zod";

import { ClusterLabelsSchema } from "./ClusterLabels";
import { TimestampSchema } from "./Common";

/**
 * Operational status reported by an agent node.
 */
export const NodeStatusSchema = z.enum([
    "registering",
    "online",
    "offline",
    "draining",
    "unhealthy"
]);

/**
 * Telemetry snapshot for a registered cluster node.
 */
export const NodeResourcesSchema = z.object({
    cpuMillisTotal: z.number().int().nonnegative(),
    cpuMillisUsed: z.number().int().nonnegative(),
    memoryMbTotal: z.number().int().nonnegative(),
    memoryMbUsed: z.number().int().nonnegative(),
    diskMbTotal: z.number().int().nonnegative(),
    diskMbUsed: z.number().int().nonnegative()
});

/**
 * Cluster node registered by an agent.
 */
export const NodeSchema = z.object({
    id: z.string().min(1),
    hostname: z.string().min(1),
    status: NodeStatusSchema,
    labels: ClusterLabelsSchema.default({}),
    capabilities: z.array(z.string()).default([]),
    resources: NodeResourcesSchema,
    agentVersion: z.string().min(1),
    agentUrl: z.string().url().optional(),
    netbirdDeviceId: z.string().min(1).optional(),
    lastHeartbeatAt: TimestampSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
