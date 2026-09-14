import { z } from "zod";

import { VolumeBackupPolicySchema } from "./BackupTask";
import { CronExpressionSchema, DurationSchema, SecretReferenceSchema } from "./Common";
import { AppsCatalogSchema, ManifestVarsSchema } from "./ComposeExtends";
import { IngressSchema } from "./Ingress";
import { LogRotationPolicySchema } from "./LogRotationTask";
import { TaskSchema } from "./Task";

/**
 * Deployment placement (single node or target group).
 */
export const NaulitePlacementSchema = z.object({
    target: z.string().min(1).optional(),
    targetGroup: z.string().min(1).optional()
}).superRefine((placement, ctx) => {
    if (placement.target && placement.targetGroup) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Cannot declare both target and targetGroup.",
            path: ["targetGroup"]
        });
    }
});

/**
 * Host process runtime (PM2 or systemd).
 */
export const NauliteHostUnitSchema = z.object({
    kind: z.enum(["pm2", "systemd"]),
    name: z.string().min(1)
});

/**
 * Host runtime extension block.
 */
export const NauliteHostRuntimeSchema = z.object({
    runtime: z.literal("host"),
    unit: NauliteHostUnitSchema
});

/**
 * Horizontal / process scale hints from x-naulite.
 */
export const NauliteScaleSchema = z.object({
    replicas: z.number().int().positive().optional(),
    processes: z.number().int().positive().optional()
});

/**
 * @todo rename platform prefix after final platform name is chosen
 * Unified build block: context, output image tag, provider, and builder placement.
 */
const ManifestBuildBaseSchema = z.object({
    context: z.string().min(1),
    dockerfile: z.string().min(1).optional(),
    image: z.string().min(1).optional(),
    provider: z.enum(["docker", "kaniko", "script"]).default("docker"),
    target: z.string().min(1).optional(),
    targetGroup: z.string().min(1).optional()
});

export const ManifestBuildSchema = ManifestBuildBaseSchema.superRefine((build, ctx) => {
    if (build.target && build.targetGroup) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Build cannot declare both target and targetGroup.",
            path: ["targetGroup"]
        });
    }
});

/**
 * @deprecated Use ManifestBuildSchema fields inside `build` instead.
 */
export const BuildOptionsSchema = ManifestBuildBaseSchema.omit({ context: true }).extend({
    context: z.string().min(1).optional()
});

/**
 * Optional per-manifest notification overrides.
 */
export const ManifestPipelineNotificationsSchema = z.object({
    notifications: z.object({
        slack: z.object({
            enabled: z.boolean().default(true),
            channel: z.string().optional()
        }).optional()
    }).optional()
});

/**
 * Manifest-level defaults applied to services and volumes.
 */
export const ManifestDefaultsSchema = z.object({
    logRotation: LogRotationPolicySchema.optional()
});

export const ManifestFunctionSchema = z.object({
    timeout: DurationSchema.default("60s"),
    trigger: z.object({
        http: z.boolean().default(false),
        cron: CronExpressionSchema.optional()
    }).default({ http: false })
});

/**
 * Service definition inside a Compose-compatible manifest.
 */
export const ManifestServiceSchema = z.object({
    image: z.string().min(1).optional(),
    build: z.union([z.string().min(1), ManifestBuildSchema]).optional(),
    command: z.union([z.string(), z.array(z.string())]).optional(),
    function: ManifestFunctionSchema.optional(),
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
    placement: NaulitePlacementSchema.optional(),
    runtime: z.literal("host").optional(),
    unit: NauliteHostUnitSchema.optional(),
    scale: NauliteScaleSchema.optional(),
    capabilities: z.array(z.string()).default([]),
    ingress: IngressSchema.optional(),
    logRotation: LogRotationPolicySchema.optional(),
    secrets: z.array(SecretReferenceSchema).default([]),
    deploy: z.object({
        replicas: z.number().int().positive().default(1)
    }).optional()
}).superRefine((service, ctx) => {
    const isHost = service.runtime === "host";

    if (service.image && service.build) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Service cannot declare both image and build.",
            path: ["build"]
        });
    }

    if (isHost) {
        if (service.image || service.build) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Host runtime service cannot declare image or build.",
                path: ["runtime"]
            });
        }

        if (!service.unit) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Host runtime service requires unit.kind and unit.name.",
                path: ["unit"]
            });
        }
    } else if (!service.image && !service.build) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Service must declare image, build, or host runtime.",
            path: ["image"]
        });
    }

    if (service.function) {
        if (service.deploy?.replicas) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Function service cannot declare deploy.replicas.",
                path: ["deploy", "replicas"]
            });
        }

        if (service.logRotation) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Function service cannot declare logRotation.",
                path: ["logRotation"]
            });
        }

        if (service.ingress && !service.function.trigger.http) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Function ingress requires function.trigger.http = true.",
                path: ["function", "trigger", "http"]
            });
        }
    }
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
    services: z.record(z.string(), ManifestServiceSchema).default({}),
    tasks: z.array(TaskSchema).default([]),
    vars: ManifestVarsSchema,
    apps: AppsCatalogSchema.optional(),
    volumes: z.record(z.string(), ManifestVolumeSchema).default({}),
    networks: z.record(z.string(), ManifestNetworkSchema).default({}),
    registries: z.record(z.string(), ManifestRegistrySchema).default({}),
    defaults: ManifestDefaultsSchema.optional(),
    pipeline: ManifestPipelineNotificationsSchema.optional()
});
