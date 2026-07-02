import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ApplyService } from "../services/ApplyService.js";

const GitOpsWebhookBodySchema = z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().min(1).default("main"),
    commitSha: z.string().min(1).optional(),
    revision: z.string().min(1).optional(),
    overlayPaths: z.array(z.string().min(1)).default([]),
    manifestPath: z.string().min(1).default("compose.yaml")
});

/**
 * Registers GitOps webhook routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerGitOpsRoutes(app: FastifyInstance): Promise<void> {
    app.post("/gitops/webhook", async (request) => {
        const body = GitOpsWebhookBodySchema.parse(request.body);
        const manifestYaml = await app.controlPlane.gitOpsService.checkoutAndMerge({
            repositoryUrl: body.repositoryUrl,
            branch: body.branch,
            commitSha: body.commitSha ?? body.revision,
            overlayPaths: body.overlayPaths
        });

        const applyResult = await ApplyService.execute(app.controlPlane, manifestYaml, {
            repositoryUrl: body.repositoryUrl,
            branch: body.branch,
            commitSha: body.commitSha ?? body.revision
        });

        await app.controlPlane.controlPlaneSync.publish("gitops.webhook", {
            revision: applyResult.revision,
            manifestName: applyResult.manifestName
        });

        return applyResult;
    });

    app.get("/gitops/revisions", async (request) => {
        const query = z.object({
            manifestName: z.string().min(1).optional()
        }).parse(request.query);

        return {
            revisions: await app.controlPlane.gitOpsService.listRevisions(query.manifestName)
        };
    });

    app.post("/gitops/rollback/:revisionId", async (request, reply) => {
        const params = z.object({
            revisionId: z.string().min(1)
        }).parse(request.params);

        const revision = await app.controlPlane.gitOpsService.getRevision(params.revisionId);

        if (!revision) {
            return reply.status(404).send({
                error: "not_found",
                message: `Revisão ${params.revisionId} não encontrada.`
            });
        }

        const applyResult = await ApplyService.execute(app.controlPlane, revision.manifestYaml, {
            repositoryUrl: revision.repositoryUrl,
            branch: revision.branch,
            commitSha: revision.commitSha,
            rolledBackFromId: revision.id
        });

        return applyResult;
    });
}
