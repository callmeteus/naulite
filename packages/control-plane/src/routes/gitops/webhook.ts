import { ApplyService } from "../../services/ApplyService";
import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { GitOpsWebhookBodySchema, LooseObjectSchema } from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Webhook GitOps",
        description: "Receives a repository event, checks out/merges, and applies the resulting manifest.",
        tags: ["gitops"],
        operationId: "handleGitOpsWebhook",
        body: GitOpsWebhookBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },
    async handler(req) {
        const body = req.body;
        const manifestYaml = await ControlPlaneService.GitOps.checkoutAndMerge({
            repositoryUrl: body.repositoryUrl,
            branch: body.branch ?? "main",
            commitSha: body.commitSha ?? body.revision,
            overlayPaths: body.overlayPaths ?? []
        });

        const applyResult = await ApplyService.execute(manifestYaml, {
            repositoryUrl: body.repositoryUrl,
            branch: body.branch ?? "main",
            commitSha: body.commitSha ?? body.revision
        });

        await ControlPlaneService.Sync.publish("gitops.webhook", {
            revision: applyResult.revision,
            manifestName: applyResult.manifestName
        });

        return applyResult;
    }
});
