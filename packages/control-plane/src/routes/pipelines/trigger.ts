import { LooseObjectSchema, PipelineTriggerBodySchema } from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { ComposeParser } from "../../orchestration/ComposeParser";
import { GitOpsPipelineTriggerService } from "../../services/pipeline/GitOpsPipelineTriggerService";

export const POST = defineRoute({
    preHandler: [
        async (request) => {
            await AuthPreHandlers.enforceAuthorization(request);
        },
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Trigger pipeline manually",
        description: "Checks out the manifest and runs the declared pipeline without waiting for coalesce.",
        tags: ["pipelines"],
        operationId: "triggerPipeline",
        body: PipelineTriggerBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },

    async handler(req) {
        const body = req.body;
        const checkout = await ControlPlaneService.GitOps.checkoutAndMerge({
            repositoryUrl: body.repositoryUrl,
            branch: body.branch,
            commitSha: body.commitSha,
            overlayPaths: body.overlayPaths,
            manifestPath: body.manifestPath
        });

        const manifest = new ComposeParser().parse(checkout.manifestYaml);

        const runId = await GitOpsPipelineTriggerService.triggerNow(
            ControlPlaneService.requireContext(),
            {
                manifestYaml: checkout.manifestYaml,
                manifestName: manifest.name,
                workDir: checkout.workDir,
                repositoryUrl: body.repositoryUrl,
                repositoryFullName: body.repositoryFullName,
                branch: body.branch,
                commitSha: body.commitSha ?? checkout.commitSha,
                runtimeVars: body.vars
            }
        );

        return {
            accepted: true,
            runId
        };
    }
});
