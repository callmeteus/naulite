import { z } from "zod";

import {
    IdParamsSchema,
    PipelineEventListSchema,
    PipelineEventSchema,
    PipelineRunEventBodySchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { ApplyService } from "../../../services/ApplyService";
import { BuildService } from "../../../services/BuildService";
import { PipelineRunService } from "../../../services/PipelineRunService";

const PipelineEventQuerySchema = z.object({
    since: z.coerce.number().int().nonnegative().optional()
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:read"),
    schema: {
        summary: "List pipeline run events",
        description: "Returns the timeline for a pipeline run.",
        tags: ["runs"],
        operationId: "listPipelineRunEvents",
        params: IdParamsSchema,
        querystring: PipelineEventQuerySchema,
        response: {
            200: PipelineEventListSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const run = await PipelineRunService.getRun(req.params.id);

        if (!run) {
            return res.status(404).send({ message: "Pipeline run not found." });
        }

        return PipelineRunService.listEvents(req.params.id, req.query.since);
    }
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:write"),
    schema: {
        summary: "Emit pipeline run event",
        description: "Appends a timeline event to a pipeline run.",
        tags: ["runs"],
        operationId: "emitPipelineRunEvent",
        params: IdParamsSchema,
        body: PipelineRunEventBodySchema,
        response: {
            200: PipelineEventSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const run = await PipelineRunService.getRun(req.params.id);

        if (!run) {
            return res.status(404).send({ message: "Pipeline run not found." });
        }

        const body = req.body;
        const message = body.message || body.kind;
        const stepStatus = resolveStepStatus(body.kind);

        if (body.stepName && stepStatus) {
            if (body.kind.startsWith("build.step.")) {
                await BuildService.handleAgentBuildStepEvent(
                    req.params.id,
                    {
                        kind: body.kind,
                        stepName: body.stepName,
                        message: body.message,
                        exitCode: body.exitCode,
                        logText: body.logText,
                        nodeId: body.nodeId,
                        nodeHostname: body.nodeHostname,
                        pool: body.pool
                    },
                    stepStatus
                );
            } else
            if (body.kind.startsWith("deploy.step.")) {
                await ApplyService.handleAgentDeployStepEvent(
                    req.params.id,
                    {
                        kind: body.kind,
                        stepName: body.stepName,
                        message: body.message,
                        exitCode: body.exitCode,
                        logText: body.logText,
                        nodeId: body.nodeId,
                        nodeHostname: body.nodeHostname,
                        pool: body.pool
                    },
                    stepStatus
                );
            } else {
                await PipelineRunService.transitionStep(
                    req.params.id,
                    body.stepName,
                    stepStatus,
                    {
                        exitCode: body.exitCode,
                        logText: body.logText,
                        nodeId: body.nodeId,
                        nodeHostname: body.nodeHostname,
                        pool: body.pool,
                        message,
                        eventKind: body.kind
                    }
                );
            }

            const events = await PipelineRunService.listEvents(req.params.id);
            return events[events.length - 1];
        }

        return PipelineRunService.emitEvent(req.params.id, {
            kind: body.kind,
            message,
            level: body.level,
            emoji: body.emoji,
            stepId: body.stepId,
            stepName: body.stepName,
            exitCode: body.exitCode,
            logText: body.logText,
            metadata: body.metadata,
            nodeId: body.nodeId,
            nodeHostname: body.nodeHostname,
            pool: body.pool
        });
    }
});

/**
 * Maps agent event kinds to pipeline step status transitions.
 *
 * @param kind Event kind string
 * @returns Step status or null when the kind is not a step transition
 */
function resolveStepStatus(kind: string): "running" | "succeeded" | "failed" | null {
    if (kind.endsWith(".started")) {
        return "running";
    }

    if (kind.endsWith(".finished")) {
        return "succeeded";
    }

    if (kind.endsWith(".failed") || kind === "ci.pipeline.failed") {
        return "failed";
    }

    return null;
}
