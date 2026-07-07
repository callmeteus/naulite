import { z } from "zod";

import { SecretReferenceSchema, TimestampSchema } from "./Common";

/**
 * Container registry blob destination for the built-in local provider.
 */
export const LocalContainerRegistryDestinationSchema = z.object({
    provider: z.literal("local"),
    path: z.string().min(1)
});

/**
 * Container registry blob destination that streams to another node.
 */
export const NodeContainerRegistryDestinationSchema = z.object({
    provider: z.literal("node"),
    nodeId: z.string().min(1),
    path: z.string().min(1)
});

/**
 * Container registry blob destination backed by an S3-compatible object store.
 */
export const S3ContainerRegistryDestinationSchema = z.object({
    provider: z.literal("s3"),
    bucket: z.string().min(1),
    prefix: z.string().default(""),
    region: z.string().min(1),
    endpoint: z.string().optional(),
    credentialsSecret: SecretReferenceSchema
});

/**
 * Container registry blob destination backed by a registered plugin provider.
 */
export const PluginContainerRegistryDestinationSchema = z.object({
    provider: z.string().min(1),
    config: z.record(z.string(), z.unknown()).default({})
});

/**
 * Union of supported container registry blob destinations.
 */
export const ContainerRegistryDestinationSchema = z.union([
    LocalContainerRegistryDestinationSchema,
    NodeContainerRegistryDestinationSchema,
    S3ContainerRegistryDestinationSchema,
    PluginContainerRegistryDestinationSchema
]);

/**
 * Metadata for a container image stored in the platform registry.
 */
export const ContainerRegistryImageSchema = z.object({
    name: z.string().min(1),
    tag: z.string().min(1),
    digest: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    destination: ContainerRegistryDestinationSchema,
    location: z.string().min(1),
    pushedAt: TimestampSchema
});
