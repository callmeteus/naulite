import { z } from "zod";

import { SecretReferenceSchema } from "./Common.js";
import { VolumeBackupPolicySchema } from "./BackupTask.js";
import { ClusterPlacementSchema } from "./ClusterLabels.js";
import { IngressSchema } from "./Ingress.js";
import { LogRotationPolicySchema } from "./LogRotationTask.js";

/**
 * Docker or Kaniko build options declared beside Compose build.
 */
export const BuildOptionsSchema = z.object({
    provider: z.enum(["docker", "kaniko"]).default("docker"),
    context: z.string().min(1).optional(),
    dockerfile: z.string().min(1).optional(),
    cluster: ClusterPlacementSchema.optional()
});

/**
 * Manifest-level defaults applied to services and volumes.
 */
export const ManifestDefaultsSchema = z.object({
    cluster: ClusterPlacementSchema.optional(),
    logRotation: LogRotationPolicySchema.optional()
});

/**
 * Service definition inside a Compose-compatible manifest.
 */
export const ManifestServiceSchema = z.object({
    image: z.string().min(1).optional(),
    build: z.union([z.string(), z.object({
        context: z.string().min(1),
        dockerfile: z.string().min(1).optional()
    })]).optional(),
    command: z.union([z.string(), z.array(z.string())]).optional(),
    environment: z.record(z.string(), z.string()).optional(),
    ports: z.array(z.union([
        z.string(),
        z.object({
            target: z.number().int().positive(),
            published: z.number().int().positive().optional(),
            protocol: z.enum(["tcp", "udp"]).default("tcp")
        })
    ])).optional(),
    volumes: z.array(z.string()).optional(),
    networks: z.array(z.string()).optional(),
    dependsOn: z.array(z.string()).optional(),
    cluster: ClusterPlacementSchema.optional(),
    capabilities: z.array(z.string()).default([]),
    buildOptions: BuildOptionsSchema.optional(),
    ingress: IngressSchema.optional(),
    logRotation: LogRotationPolicySchema.optional(),
    secrets: z.array(SecretReferenceSchema).default([])
});

/**
 * Volume definition inside a Compose-compatible manifest.
 */
export const ManifestVolumeSchema = z.object({
    driver: z.string().min(1).optional(),
    backup: VolumeBackupPolicySchema.optional()
});

/**
 * Network definition inside a Compose-compatible manifest.
 */
export const ManifestNetworkSchema = z.object({
    local: z.boolean().default(false),
    driver: z.string().min(1).optional()
});

/**
 * Registry entry declared at the top level of a manifest.
 */
export const ManifestRegistrySchema = z.object({
    url: z.string().url(),
    default: z.boolean().default(false),
    credentialsSecret: SecretReferenceSchema.optional()
});

/**
 * Full platform manifest parsed only by the control plane.
 */
export const ManifestSchema = z.object({
    name: z.string().min(1),
    services: z.record(z.string(), ManifestServiceSchema),
    volumes: z.record(z.string(), ManifestVolumeSchema).default({}),
    networks: z.record(z.string(), ManifestNetworkSchema).default({}),
    registries: z.record(z.string(), ManifestRegistrySchema).default({}),
    defaults: ManifestDefaultsSchema.optional()
});
