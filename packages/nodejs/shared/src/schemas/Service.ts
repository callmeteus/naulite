import { z } from "zod";

import { ClusterPlacementSchema } from "./ClusterLabels";
import { LifecycleStatusSchema, SecretReferenceSchema, TimestampSchema } from "./Common";
import { IngressSchema } from "./Ingress";
import { LogRotationPolicySchema } from "./LogRotationTask";
import { ManifestFunctionSchema } from "./Manifest";

/**
 * Container runtime spec persisted for planner diffing between applies.
 */
export const ServiceDeploySpecSchema = z.object({
    command: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
    ports: z.array(z.object({
        containerPort: z.number().int().positive(),
        hostPort: z.number().int().positive().optional(),
        protocol: z.enum(["tcp", "udp"]).default("tcp")
    })).default([]),

    secrets: z.array(SecretReferenceSchema).default([]),
    volumeMounts: z.array(z.object({
        volumeName: z.string().min(1),
        mountPath: z.string().min(1),
        readOnly: z.boolean().default(false)
    })).default([])
});

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
 * Naulite service definition derived from a manifest.
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
    deploySpec: ServiceDeploySpecSchema.optional(),
    functionSpec: ManifestFunctionSchema.optional(),
    lifecycleStatus: LifecycleStatusSchema.optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema
});
