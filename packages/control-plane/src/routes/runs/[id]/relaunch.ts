import { IdParamsSchema, RouteErrorResponseSchema } from "@naulite/shared";
import { z } from "zod";

import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { HTTP409Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";
import { PipelineRunService } from "../../../services/PipelineRunService";

const RelaunchBodySchema = z.object({
    failedOnly: z.boolean().optional()
});

const RelaunchResponseSchema = z.object({
    id: z.string(),
    status: z.string()
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("runs:write"),
    schema: {
        summary: "Relaunch pipeline run",
        description: "Creates a new pipeline run from a previous run.",
        tags: ["runs"],
        operationId: "relaunchPipelineRun",
        params: IdParamsSchema,
        body: RelaunchBodySchema,
        response: {
            201: RelaunchResponseSchema,
            409: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const source = await PipelineRunService.getRun(req.params.id);

        if (!source) {
            throw new HTTP409Error("Pipeline run not found.", {
                error: "conflict"
            });
        }

        if (source.status === "running" || source.status === "pending") {
            throw new HTTP409Error("Run is still running.", {
                error: "conflict"
            });
        }

        const run = await PipelineRunService.createRun({
            kind: source.kind,
            manifestName: source.manifestName,
            serviceName: source.serviceName,
            imageRef: source.imageRef,
            commitSha: source.commitSha,
            branch: source.branch,
            revisionId: source.revisionId,
            pool: source.pool,
            nodeId: req.body.failedOnly ? source.nodeId : source.nodeId,
            nodeHostname: source.nodeHostname
        });

        await PipelineRunService.markRunning(run.id);
        res.status(201);

        return {
            id: run.id,
            status: run.status
        };
    }
});
