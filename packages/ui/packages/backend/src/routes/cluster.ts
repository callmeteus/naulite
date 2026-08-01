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

    app.get("/nodes/:id", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.getNode(params.id);
    });

    app.get("/nodes/:id/host/inventory", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);
        const query = z.object({
            refresh: z.enum(["true", "false"]).optional()
        }).parse(request.query);

        const client = controlPlaneForRequest(app, request);
        return client.getNodeHostInventory(params.id, {
            refresh: query.refresh === "true"
        });
    });

    app.post("/nodes/:id/host/inventory/refresh", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.refreshNodeHostInventory(params.id);
    });

    app.post("/nodes/:id/host/packages/update", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);
        const body = z.object({
            packages: z.array(z.string().min(1)).optional()
        }).parse(request.body ?? {});

        const client = controlPlaneForRequest(app, request);
        return client.updateNodePackages(params.id, body.packages);
    });

    app.post("/nodes/:id/host/system/update", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.updateNodeSystem(params.id);
    });

    app.get("/nodes/:id/host/updates", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.listNodeHostUpdates(params.id);
    });

    app.get("/instances", async (request) => {
        const query = z.object({
            serviceName: z.string().min(1).optional(),
            nodeId: z.string().min(1).optional()
        }).parse(request.query);

        const client = controlPlaneForRequest(app, request);
        return client.listInstances({
            serviceName: query.serviceName,
            nodeId: query.nodeId
        });
    });

    app.get("/instances/:id", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.getInstance(params.id);
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

    app.post("/instances/:id/stop", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.stopInstance(params.id);
    });

    app.post("/instances/:id/start", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.startInstance(params.id);
    });

    app.post("/instances/:id/restart", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.restartInstance(params.id);
    });

    app.delete("/instances/:id", async (request) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.removeInstance(params.id);
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

    app.get("/services/:name", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.getService(params.name);
    });

    app.post("/services/:name/reconcile", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.reconcileService(params.name);
    });

    app.delete("/services/:name", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        await client.deleteService(params.name);
        return { deleted: true, name: params.name };
    });

    app.get("/functions/:name/runs", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);
        const pagination = parsePaginationQuery(request.query as Record<string, unknown>);

        const client = controlPlaneForRequest(app, request);
        return client.listFunctionRuns(params.name, pagination);
    });

    app.get("/functions/:name/runs/:id", async (request) => {
        const params = z.object({
            name: z.string().min(1),
            id: z.string().min(1)
        }).parse(request.params);

        const client = controlPlaneForRequest(app, request);
        return client.getFunctionRun(params.name, params.id);
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
        const query = request.query as { async?: string };

        return app.controlPlane.applyManifest(body.manifest, {
            async: query.async === "true"
        });
    });
}
