import { IdParamsSchema, RouteMessageResponseSchema, RouteErrorResponseSchema } from "@naulite/shared";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { HTTP409Error } from "../../../errors/TreatedError";
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
            200: RouteMessageResponseSchema,
            409: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        try {
            await ApplyStageRunner.abortRun(req.params.id);
            return { message: "Run aborted." };
        } catch (err) {
            if (err instanceof HTTP409Error) {
                return res.status(409).send({ message: err.message });
            }

            throw err;
        }
    }
});
