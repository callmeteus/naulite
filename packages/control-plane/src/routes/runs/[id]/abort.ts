import { IdParamsSchema, RouteMessageResponseSchema } from "@naulite/shared";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { ApplyStageRunner } from "../../../services/ApplyStageRunner";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:write"),
    schema: {
        summary: "Abort pipeline run",
        description: "Fails a running or gated pipeline run.",
        tags: ["runs"],
        operationId: "abortPipelineRun",
        params: IdParamsSchema,
        response: {
            200: RouteMessageResponseSchema
        }
    },

    async handler(req) {
        await ApplyStageRunner.abortRun(req.params.id);
        return { message: "Run aborted." };
    }
});
