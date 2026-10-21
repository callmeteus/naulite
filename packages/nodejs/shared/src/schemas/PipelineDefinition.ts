import { z } from "zod";

import { DurationSchema } from "./Common";

/**
 * Label selector operator for generator items (k8s-style).
 */
export const PipelineSelectorOperatorSchema = z.enum([
    "In",
    "NotIn",
    "Exists",
    "DoesNotExist"
]);

/**
 * One match expression against item fields (dot paths).
 */
export const PipelineMatchExpressionSchema = z.object({
    key: z.string().min(1),
    operator: PipelineSelectorOperatorSchema,
    values: z.array(z.string()).optional()
});

/**
 * Selector applied after generator expansion.
 */
export const PipelineSelectorSchema = z.object({
    matchLabels: z.record(z.string(), z.string()).optional(),
    matchExpressions: z.array(PipelineMatchExpressionSchema).optional()
});

/**
 * Git-backed generator source.
 */
export const PipelineGeneratorGitSchema = z.object({
    directories: z.object({
        path: z.string().min(1),
        exclude: z.array(z.string()).default([])
    })
});

/**
 * Declarative generator that yields opaque pipeline items.
 */
export const PipelineGeneratorSchema = z.object({
    name: z.string().min(1),
    git: PipelineGeneratorGitSchema.optional(),
    valuesFile: z.string().min(1).optional(),
    defaults: z.object({
        values: z.record(z.string(), z.unknown()).optional()
    }).optional(),
    selector: PipelineSelectorSchema.optional()
});

/**
 * Coalesce window for push triggers.
 */
export const PipelineCoalesceSchema = z.object({
    window: DurationSchema
});

/**
 * Fan-out rule when a webhook names a repository.
 */
export const PipelineFanoutRuleSchema = z.object({
    repos: z.array(z.string().min(1)).min(1),
    capture: z.string().optional(),
    select: z.union([
        z.literal("all"),
        z.object({
            matchLabels: z.record(z.string(), z.string())
        })
    ])
});

/**
 * Push / delete trigger configuration.
 */
export const PipelinePushTriggerSchema = z.object({
    branches: z.array(z.string().min(1)).optional(),
    when: z.string().optional(),
    coalesce: PipelineCoalesceSchema.optional(),
    fanout: z.object({
        generator: z.string().min(1),
        rules: z.array(PipelineFanoutRuleSchema).min(1)
    }).optional()
});

export const PipelineDeleteTriggerSchema = z.object({
    branches: z.array(z.string().min(1)).optional(),
    when: z.string().optional()
});

export const PipelineTriggersSchema = z.object({
    push: PipelinePushTriggerSchema.optional(),
    delete: PipelineDeleteTriggerSchema.optional()
});

/**
 * Sandbox checkout for CI jobs.
 */
export const PipelineSandboxCheckoutSchema = z.object({
    root: z.string().min(1),
    branch: z.string().optional(),
    extraRepos: z.array(z.string()).optional()
});

export const PipelineSandboxSchema = z.object({
    parent: z.string().min(1).optional(),
    workdir: z.string().optional(),
    checkout: PipelineSandboxCheckoutSchema.optional()
});

/**
 * S3 artifact destination for job output.
 */
export const PipelineArtifactsSchema = z.object({
    paths: z.array(z.string().min(1)).default([]),
    destination: z.enum(["s3"]).default("s3"),
    prefix: z.string().optional(),
    bucket: z.string().optional()
});

/**
 * Rollout ordering for deploy stages.
 */
export const PipelineRolloutSchema = z.object({
    partitionBy: z.string().min(1).optional(),
    order: z.array(z.string()).optional(),
    parallel: z.boolean().default(true),
    soak: DurationSchema.optional(),
    health: z.object({
        url: z.string().optional(),
        consecutiveOk: z.number().int().positive().default(3)
    }).optional()
});

/**
 * CI/CD job inside a stage.
 */
export const PipelineJobStepSchema = z.union([
    z.string().min(1),
    z.object({
        name: z.string().min(1).optional(),
        run: z.string().min(1),
        when: z.string().optional()
    })
]);

export const PipelineJobSchema = z.object({
    name: z.string().min(1),
    when: z.string().optional(),
    sandbox: PipelineSandboxSchema.optional(),
    steps: z.array(PipelineJobStepSchema).default([]),
    artifacts: PipelineArtifactsSchema.optional(),
    forEach: z.object({
        generator: z.string().min(1)
    }).optional()
});

/**
 * Sequential stage containing parallel jobs.
 */
export const PipelineStageSchema = z.object({
    name: z.string().min(1),
    when: z.string().optional(),
    gate: z.enum(["auto", "manual"]).optional(),
    jobs: z.array(PipelineJobSchema).default([]),
    rollout: PipelineRolloutSchema.optional()
});

/**
 * Optional Slack notification overrides (legacy pipeline.notifications).
 */
export const PipelineNotificationsSchema = z.object({
    slack: z.object({
        enabled: z.boolean().default(true),
        channel: z.string().optional()
    }).optional()
});

/**
 * Full declarative CI/CD pipeline on a manifest.
 */
export const PipelineDefinitionSchema = z.object({
    triggers: PipelineTriggersSchema.optional(),
    generators: z.array(PipelineGeneratorSchema).default([]),
    stages: z.array(PipelineStageSchema).default([]),
    rollout: PipelineRolloutSchema.optional(),
    notifications: PipelineNotificationsSchema.optional()
});

export type PipelineDefinition = z.infer<typeof PipelineDefinitionSchema>;
export type PipelineGenerator = z.infer<typeof PipelineGeneratorSchema>;
export type PipelineStage = z.infer<typeof PipelineStageSchema>;
export type PipelineJob = z.infer<typeof PipelineJobSchema>;
export type PipelineRollout = z.infer<typeof PipelineRolloutSchema>;
export type PipelineFanoutRule = z.infer<typeof PipelineFanoutRuleSchema>;
export type PipelineMatchExpression = z.infer<typeof PipelineMatchExpressionSchema>;
export type PipelineJobStep = z.infer<typeof PipelineJobStepSchema>;
