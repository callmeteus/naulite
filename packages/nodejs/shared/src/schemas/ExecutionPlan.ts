import { z } from "zod";

import { ResolvedSecretSchema, ResourceRequirementsSchema } from "./Common";

/**
 * Pull an image on the target node before instance creation.
 */
export const PullOperationSchema = z.object({
    type: z.literal("pull"),
    image: z.string().min(1),
    registryId: z.string().min(1).optional()
});

/**
 * Create a new container instance from a service specification.
 */
export const CreateInstanceOperationSchema = z.object({
    type: z.literal("create"),
    instanceId: z.string().min(1),
    serviceName: z.string().min(1),
    image: z.string().min(1),
    command: z.array(z.string()).default([]),
    environment: z.record(z.string(), z.string()).default({}),
    volumes: z.array(z.object({
        volumeName: z.string().min(1),
        mountPath: z.string().min(1),
        readOnly: z.boolean().default(false)
    })).default([]),

    networks: z.array(z.string()).default([]),
    ports: z.array(z.object({
        containerPort: z.number().int().positive(),
        hostPort: z.number().int().positive().optional(),
        protocol: z.enum(["tcp", "udp"]).default("tcp")
    })).default([]),

    networkMode: z.string().min(1).optional(),
    resources: ResourceRequirementsSchema.optional(),
    secrets: z.array(ResolvedSecretSchema).default([])
});

/**
 * Start a stopped instance.
 */
export const StartInstanceOperationSchema = z.object({
    type: z.literal("start"),
    instanceId: z.string().min(1)
});

/**
 * Stop a running instance.
 */
export const StopInstanceOperationSchema = z.object({
    type: z.literal("stop"),
    instanceId: z.string().min(1)
});

/**
 * Remove an instance and optionally its volumes.
 */
export const RemoveInstanceOperationSchema = z.object({
    type: z.literal("remove"),
    instanceId: z.string().min(1),
    force: z.boolean().default(false)
});

/**
 * Attach an instance to a Docker network on the node.
 */
export const ConnectNetworkOperationSchema = z.object({
    type: z.literal("connectNetwork"),
    instanceId: z.string().min(1),
    networkName: z.string().min(1)
});

/**
 * Detach an instance from a Docker network on the node.
 */
export const DisconnectNetworkOperationSchema = z.object({
    type: z.literal("disconnectNetwork"),
    instanceId: z.string().min(1),
    networkName: z.string().min(1)
});

/**
 * Ensure a volume exists on the target node.
 */
export const EnsureVolumeOperationSchema = z.object({
    type: z.literal("ensureVolume"),
    volumeName: z.string().min(1),
    mountPath: z.string().min(1)
});

/**
 * Remove a Docker volume from the target node.
 */
export const RemoveVolumeOperationSchema = z.object({
    type: z.literal("removeVolume"),
    volumeName: z.string().min(1),
    force: z.boolean().default(false)
});

/**
 * Ordered runtime operation dispatched to an agent.
 */
export const ExecutionOperationSchema = z.discriminatedUnion("type", [
    PullOperationSchema,
    CreateInstanceOperationSchema,
    StartInstanceOperationSchema,
    StopInstanceOperationSchema,
    RemoveInstanceOperationSchema,
    ConnectNetworkOperationSchema,
    DisconnectNetworkOperationSchema,
    EnsureVolumeOperationSchema,
    RemoveVolumeOperationSchema
]);

/**
 * Execution plan produced by the scheduler for a single node.
 */
export const ExecutionPlanSchema = z.object({
    planId: z.string().min(1),
    revision: z.number().int().nonnegative(),
    nodeId: z.string().min(1),
    manifestName: z.string().min(1),
    runId: z.string().min(1).optional(),
    operations: z.array(ExecutionOperationSchema),
    createdAt: z.string().datetime({ offset: true })
});
