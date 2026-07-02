import { z } from "zod";

import { ApplyService } from "../../services/ApplyService";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

const GitOpsWebhookBodySchema = z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().min(1).default("main"),
    commitSha: z.string().min(1).optional(),
    revision: z.string().min(1).optional(),
    overlayPaths: z.array(z.string().min(1)).default([]),
    manifestPath: z.string().min(1).default("compose.yaml")
});

export const POST = defineRoute({
    async handler(req) {
        const body = GitOpsWebhookBodySchema.parse(req.body);
        const manifestYaml = await ControlPlaneService.GitOps.checkoutAndMerge({
            repositoryUrl: body.repositoryUrl,
            branch: body.branch,
            commitSha: body.commitSha ?? body.revision,
            overlayPaths: body.overlayPaths
        });

        const applyResult = await ApplyService.execute(manifestYaml, {
            repositoryUrl: body.repositoryUrl,
            branch: body.branch,
            commitSha: body.commitSha ?? body.revision
        });

        await ControlPlaneService.Sync.publish("gitops.webhook", {
            revision: applyResult.revision,
            manifestName: applyResult.manifestName
        });

        return applyResult;
    }
});
