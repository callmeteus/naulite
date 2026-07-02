import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Registers resource listing routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerResourceRoutes(app: FastifyInstance): Promise<void> {
    app.get("/services", async (request) => {
        const query = z.object({
            manifestName: z.string().min(1).optional()
        }).parse(request.query);
        return (await app.controlPlane.store.listServices())
            .filter((service) => !query.manifestName || service.manifestName === query.manifestName);
    });

    app.get("/instances", async (request) => {
        const query = z.object({
            serviceName: z.string().min(1).optional(),
            nodeId: z.string().min(1).optional()
        }).parse(request.query);
        return (await app.controlPlane.store.listInstances())
            .filter((instance) => {
                if (query.serviceName && instance.serviceName !== query.serviceName) {
                    return false;
                }

                if (query.nodeId && instance.nodeId !== query.nodeId) {
                    return false;
                }

                return true;
            });
    });

    app.get("/volumes", async (request) => {
        const query = z.object({
            manifestName: z.string().min(1).optional()
        }).parse(request.query);
        return (await app.controlPlane.store.listVolumes())
            .filter((volume) => !query.manifestName || volume.manifestName === query.manifestName);
    });

    app.get("/secrets", async () => {
        return app.controlPlane.store.listSecrets();
    });

    app.get("/registry", async () => {
        return {
            registries: ["docker.io"]
        };
    });

    app.get("/backups", async () => {
        return app.controlPlane.store.listBackupRuns();
    });
}
