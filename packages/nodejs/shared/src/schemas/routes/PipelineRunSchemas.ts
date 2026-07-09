import { z } from "zod";

import { PaginationQuerySchema } from "../Pagination";
import {
    PipelineEventSchema,
    PipelineRunKindSchema,
    PipelineRunSchema,
    PipelineRunStatusSchema
} from "../PipelineRun";

/**
 * Query filters for listing pipeline runs.
 */
export const PipelineRunListQuerySchema = PaginationQuerySchema.extend({
    kind: PipelineRunKindSchema.optional(),
    status: PipelineRunStatusSchema.optional(),
    service: z.string().min(1).optional(),
    pool: z.string().min(1).optional(),
    since: z.string().optional()
});

/**
 * Body for posting a pipeline run event from an agent or internal emitter.
 */
export const PipelineRunEventBodySchema = z.object({
    kind: z.string().min(1),
    level: z.enum(["debug", "info", "warn", "error"]).default("info"),
    message: z.string().default(""),
    emoji: z.string().optional(),
    stepId: z.string().optional(),
    stepName: z.string().optional(),
    exitCode: z.number().int().optional(),
    logText: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    nodeId: z.string().optional(),
    nodeHostname: z.string().optional(),
    pool: z.string().optional()
});

/**
 * Body for posting a pipeline step transition.
 */
export const PipelineStepEventBodySchema = z.object({
    status: z.enum(["running", "succeeded", "failed"]),
    message: z.string().optional(),
    exitCode: z.number().int().optional(),
    logText: z.string().optional(),
    nodeId: z.string().optional(),
    nodeHostname: z.string().optional(),
    pool: z.string().optional()
});

export const PipelineRunSummarySchema = PipelineRunSchema.omit({ steps: true, events: true, failureLog: true });
export const PipelineRunDetailSchema = PipelineRunSchema;
export const PipelineEventListSchema = z.array(PipelineEventSchema);
