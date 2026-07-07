import type { z } from "zod";

import {
    DockerfileStepMarkerSchema,
    DockerfileStepNameSchema
} from "../schemas/DockerfileStepMarker";
import {
    PipelineEventKindSchema,
    PipelineEventSchema,
    PipelineRunKindSchema,
    PipelineRunSchema,
    PipelineRunStatusSchema,
    PipelineStepSchema,
    PipelineStepStatusSchema
} from "../schemas/PipelineRun";

export type PipelineRunKind = z.infer<typeof PipelineRunKindSchema>;
export type PipelineRunStatus = z.infer<typeof PipelineRunStatusSchema>;
export type PipelineStepStatus = z.infer<typeof PipelineStepStatusSchema>;
export type PipelineEventKind = z.infer<typeof PipelineEventKindSchema>;
export type PipelineStep = z.infer<typeof PipelineStepSchema>;
export type PipelineEvent = z.infer<typeof PipelineEventSchema>;
export type PipelineRun = z.infer<typeof PipelineRunSchema>;
export type DockerfileStepMarker = z.infer<typeof DockerfileStepMarkerSchema>;
export type DockerfileStepName = z.infer<typeof DockerfileStepNameSchema>;
