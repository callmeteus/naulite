import {
    PaginatedListSchema,
    PipelineRunListQuerySchema,
    PipelineRunSummarySchema
} from "@naulite/shared";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { PipelineRunService } from "../services/PipelineRunService";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:read"),
    schema: {
        summary: "List pipeline runs",
        description: "Lists pipeline runs recorded by the control plane.",
        tags: ["runs"],
        operationId: "listPipelineRuns",
        querystring: PipelineRunListQuerySchema,
        response: {
            200: PaginatedListSchema(PipelineRunSummarySchema)
        }
    },

    async handler(req) {
        return PipelineRunService.listRuns(req.query);
    }
});
