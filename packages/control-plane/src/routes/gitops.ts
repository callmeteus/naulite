import type { FastifyInstance } from "fastify";
import { z } from "zod";

const GitOpsWebhookBodySchema = z.object({
    repositoryUrl: z.string().url(),
    branch: z.string().min(1).default("main"),
    commitSha: z.string().min(1).optional(),
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
            commitSha: body.commitSha,
            overlayPaths: body.overlayPaths
        });
        const manifest = app.controlPlane.composeParser.parse(manifestYaml);
        const revision = await app.controlPlane.gitOpsService.recordRevision(
            {
                repositoryUrl: body.repositoryUrl,
                branch: body.branch,
                commitSha: body.commitSha,
                overlayPaths: body.overlayPaths
            },
            manifestYaml,
            manifest
        );

        await app.controlPlane.controlPlaneSync.publish("gitops.webhook", {
            revisionId: revision.id,
            manifestName: manifest.name
        });

        return {
            accepted: true,
            revision,
            manifestName: manifest.name
        };
    });

    app.get("/gitops/revisions", async (request) => {
        const query = z.object({
            manifestName: z.string().min(1).optional()
        }).parse(request.query);

        return {
            revisions: await app.controlPlane.gitOpsService.listRevisions(query.manifestName)
        };
    });

    app.post("/gitops/rollback/:revisionId", async (request) => {
        const params = z.object({
            revisionId: z.string().min(1)
        }).parse(request.params);
        const manifest = await app.controlPlane.gitOpsService.rollback(params.revisionId);

        return {
            rolledBackTo: params.revisionId,
            manifestName: manifest.name
        };
    });
}
