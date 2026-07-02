import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ApplyBodySchema = z.object({
    manifest: z.string().min(1)
});

/**
 * Registers cluster dashboard routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerClusterRoutes(app: FastifyInstance): Promise<void> {
    app.get("/nodes", async () => {
        return app.controlPlane.listNodes();
    });

    app.get("/instances", async () => {
        return app.controlPlane.listInstances();
    });

    app.get("/volumes", async () => {
        return app.controlPlane.listVolumes();
    });

    app.get("/secrets", async () => {
        return app.controlPlane.listSecrets();
    });

    app.get("/cluster/status", async () => {
        return app.controlPlane.getClusterStatus();
    });

    app.get("/gitops/revisions", async () => {
        return app.controlPlane.listGitOpsRevisions();
    });

    app.get("/services", async () => {
        return app.controlPlane.listServices();
    });

    app.post("/gitops/rollback/:revisionId", async (request) => {
        const params = z.object({
            revisionId: z.string().min(1)
        }).parse(request.params);
        return app.controlPlane.rollbackGitOps(params.revisionId);
    });

    app.get("/backups", async () => {
        return app.controlPlane.listBackups();
    });

    app.post("/apply", async (request) => {
        const body = ApplyBodySchema.parse(request.body);
        return app.controlPlane.applyManifest(body.manifest);
    });
}
