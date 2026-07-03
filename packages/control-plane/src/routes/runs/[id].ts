import {
    IdParamsSchema,
    PipelineRunDetailSchema,
    RouteMessageResponseSchema
} from "@platform/shared";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { PipelineRunService } from "../../services/PipelineRunService";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Get pipeline run",
        description: "Returns a pipeline run with steps and recent events.",
        tags: ["runs"],
        operationId: "getPipelineRun",
        params: IdParamsSchema,
        response: {
            200: PipelineRunDetailSchema,
            404: RouteMessageResponseSchema
        }
    },
    async handler(req, res) {
        const run = await PipelineRunService.getRun(req.params.id);

        if (!run) {
            return res.status(404).send({ message: "Pipeline run not found." });
        }

        return run;
    }
});
