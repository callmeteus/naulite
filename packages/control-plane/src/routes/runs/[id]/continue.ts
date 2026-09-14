import { IdParamsSchema } from "@naulite/shared";
import { z } from "zod";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { HTTP409Error } from "../../../errors/TreatedError";
import { HostExecutorProvider } from "../../../runtime/HostExecutorProvider";
import { ApplyStageRunner } from "../../../services/ApplyStageRunner";
import { PipelineRunService } from "../../../services/PipelineRunService";

const ContinueResponseSchema = z.object({
    id: z.string(),
    status: z.string()
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:approve"),
    schema: {
        summary: "Continue gated pipeline run",
        description: "Resumes a run paused at awaiting_approval.",
        tags: ["runs"],
        operationId: "continuePipelineRun",
        params: IdParamsSchema,
        response: {
            200: ContinueResponseSchema
        }
    },

    async handler(req) {
        const approvedBy = req.adminUser?.username ?? req.authMethod ?? "operator";

        // Reject missing runs before resolving the host executor
        const existing = await PipelineRunService.getRun(req.params.id);

        if (!existing) {
            throw new HTTP409Error("Pipeline run not found.", {
                error: "conflict"
            });
        }

        const status = await ApplyStageRunner.continueRun(
            req.params.id,
            approvedBy,
            HostExecutorProvider.get()
        );
        const run = await PipelineRunService.getRun(req.params.id);

        return {
            id: req.params.id,
            status: run?.status ?? status
        };
    }
});
