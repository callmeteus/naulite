import { GitOpsWebhookBodySchema, LooseObjectSchema } from "@platform/shared";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { ApplyService } from "../../services/ApplyService";
import { ControlPlaneService } from "../../ControlPlaneService";
import { HTTP401Error } from "../../errors/TreatedError";
import { WebhookSignature } from "../../gitops/WebhookSignature";
import { defineRoute } from "../../routing/DefineRoute";

/**
 * Verifies the GitOps webhook signature when a secret is configured.
 *
 * @param request Incoming Fastify request with raw body
 * @returns Nothing.
 */
function verifyGitOpsWebhookSignature(request: {
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer | string;
}): void {
    const secret = process.env.GITOPS_WEBHOOK_SECRET?.trim();

    if (!secret) {
        return;
    }

    const provider = (process.env.GITOPS_WEBHOOK_PROVIDER ?? "generic").trim().toLowerCase();
    const rawBody = request.rawBody ?? Buffer.alloc(0);
    const resolvedProvider = provider === "github" || provider === "gitlab"
        ? provider
        : "generic";

    const valid = WebhookSignature.verify({
        provider: resolvedProvider,
        secret,
        rawBody,
        headers: request.headers
    });

    if (!valid) {
        throw new HTTP401Error("Invalid webhook signature.");
    }
}

export const POST = defineRoute({
    preHandler: [
        async (request) => {
            if (process.env.GITOPS_WEBHOOK_SECRET?.trim()) {
                verifyGitOpsWebhookSignature(request);
                return;
            }

            await AuthPreHandlers.enforceAuthorization(request);
        },
        LeaderPreHandlers.requireLeader()
    ],
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
        const checkout = await ControlPlaneService.GitOps.checkoutAndMerge({
            repositoryUrl: body.repositoryUrl,
            branch: body.branch ?? "main",
            commitSha: body.commitSha ?? body.revision,
            overlayPaths: body.overlayPaths ?? [],
            manifestPath: body.manifestPath ?? "compose.yaml"
        });

        const applyResult = await ApplyService.execute(checkout.manifestYaml, {
            repositoryUrl: body.repositoryUrl,
            branch: body.branch ?? "main",
            commitSha: body.commitSha ?? body.revision ?? checkout.commitSha,
            buildContextRoot: checkout.workDir
        });

        await ControlPlaneService.Sync.publish("gitops.webhook", {
            revision: applyResult.revision,
            manifestName: applyResult.manifestName
        });

        return applyResult;
    }
});
