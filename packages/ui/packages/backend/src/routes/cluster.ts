import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";
import { paginateArray, parsePaginationQuery } from "../util/paginateArray";

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

    app.get("/instances/:id/logs", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.getLogs(params.id);
    });

    app.post("/instances/:id/reconcile", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.reconcileInstance(params.id);
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

    app.post("/services/:name/reconcile", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.reconcileService(params.name);
    });

    app.post("/gitops/rollback/:revisionId", async (request) => {
        const params = z.object({
            revisionId: z.string().min(1)
        }).parse(request.params);

        return app.controlPlane.rollbackGitOps(params.revisionId);
    });

    app.get("/backups", async (request) => {
        const rawQuery = request.query as Record<string, unknown>;
        const pagination = parsePaginationQuery(rawQuery);
        const client = controlPlaneForRequest(app, request);

        if (!("page" in rawQuery)) {
            return client.listBackups();
        }

        try {
            return await client.listBackupsPaginated(pagination);
        } catch {
            const backups = await client.listBackups();
            return paginateArray(backups, pagination.page, pagination.limit);
        }
    });

    app.post("/apply", async (request) => {
        const body = ApplyBodySchema.parse(request.body);
        return app.controlPlane.applyManifest(body.manifest);
    });
}
