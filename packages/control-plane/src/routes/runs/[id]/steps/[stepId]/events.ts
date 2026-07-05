import {
    IdParamsSchema,
    PipelineStepEventBodySchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../../routing/DefineRoute";
import { PipelineRunService } from "../../../../../services/PipelineRunService";

const StepParamsSchema = IdParamsSchema.extend({
    stepId: IdParamsSchema.shape.id
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:write"),
    schema: {
        summary: "Emit pipeline step event",
        description: "Transitions a pipeline step and appends timeline metadata.",
        tags: ["runs"],
        operationId: "emitPipelineStepEvent",
        params: StepParamsSchema,
        body: PipelineStepEventBodySchema,
        response: {
            200: RouteMessageResponseSchema,
            404: RouteMessageResponseSchema
        }
    },
    async handler(req, res) {
        const run = await PipelineRunService.getRun(req.params.id);

        if (!run) {
            return res.status(404).send({ message: "Pipeline run not found." });
        }

        const stepName = decodeURIComponent(req.params.stepId).includes(":")
            ? decodeURIComponent(req.params.stepId).split(":").slice(1).join(":")
            : decodeURIComponent(req.params.stepId);

        const step = await PipelineRunService.transitionStep(
            req.params.id,
            stepName,
            req.body.status,
            {
                exitCode: req.body.exitCode,
                logText: req.body.logText,
                nodeId: req.body.nodeId,
                nodeHostname: req.body.nodeHostname,
                pool: req.body.pool,
                message: req.body.message
            }
        );

        if (!step) {
            return res.status(404).send({ message: "Pipeline step not found." });
        }

        return { message: "Step updated." };
    }
});
