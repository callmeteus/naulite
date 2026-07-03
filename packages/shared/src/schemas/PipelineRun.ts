import { z } from "zod";

/**
 * Pipeline run lifecycle status.
 */
export const PipelineRunStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);

/**
 * High-level pipeline run kinds.
 */
export const PipelineRunKindSchema = z.enum([
    "ci_build",
    "apply",
    "gitops_sync",
    "infra",
    "node_event"
]);

/**
 * Pipeline event kinds aligned with E7-style notifications.
 */
export const PipelineEventKindSchema = z.enum([
    "ci.build.submitted",
    "image.build.started",
    "build.step.started",
    "build.step.finished",
    "image.pushed",
    "rollout.started",
    "rollout.finished",
    "ci.build.finished",
    "ci.pipeline.failed",
    "gitops.sync.started",
    "infra.sync.finished",
    "node.disk_pressure",
    "node.disk_pressure.cleared",
    "node.left_cluster",
    "node.joined_cluster",
    "deploy.step.started",
    "deploy.step.finished",
    "deploy.step.failed"
]);

/**
 * Pipeline step lifecycle status.
 */
export const PipelineStepStatusSchema = z.enum(["pending", "running", "succeeded", "failed"]);

/**
 * Persisted pipeline step row.
 */
export const PipelineStepSchema = z.object({
    id: z.string().min(1),
    runId: z.string().min(1),
    name: z.string().min(1),
    order: z.number().int().nonnegative(),
    status: PipelineStepStatusSchema,
    nodeId: z.string().optional(),
    pool: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    exitCode: z.number().int().optional(),
    logText: z.string().optional()
});

/**
 * Persisted pipeline event row.
 */
export const PipelineEventSchema = z.object({
    id: z.number().int(),
    runId: z.string().min(1),
    stepId: z.string().optional(),
    kind: PipelineEventKindSchema,
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    message: z.string().min(1),
    emoji: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).default({}),
    createdAt: z.string()
});

/**
 * Persisted pipeline run row.
 */
export const PipelineRunSchema = z.object({
    id: z.string().min(1),
    kind: PipelineRunKindSchema,
    status: PipelineRunStatusSchema,
    manifestName: z.string().optional(),
    serviceName: z.string().optional(),
    imageRef: z.string().optional(),
    commitSha: z.string().optional(),
    branch: z.string().optional(),
    workflowId: z.string().optional(),
    pool: z.string().optional(),
    nodeId: z.string().optional(),
    nodeHostname: z.string().optional(),
    startedAt: z.string().optional(),
    completedAt: z.string().optional(),
    errorMessage: z.string().optional(),
    failureLog: z.string().optional(),
    createdAt: z.string(),
    steps: z.array(PipelineStepSchema).optional(),
    events: z.array(PipelineEventSchema).optional()
});
