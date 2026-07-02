import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { createDeclarativeRegistryProvider } from "@platform/registries";

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
        const provider = createDeclarativeRegistryProvider({
            registries: [
                {
                    id: "docker.io",
                    name: "Docker Hub",
                    url: "https://index.docker.io/v1/",
                    isDefault: true
                }
            ]
        });
        const registries = await provider.list();

        return {
            registries: registries.map((entry) => entry.id)
        };
    });

    app.delete("/services/:name", async (request, reply) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);
        const deleted = await app.controlPlane.store.deleteServiceByName(params.name);

        if (!deleted) {
            return reply.status(404).send({
                error: "not_found",
                message: `Serviço ${params.name} não encontrado.`
            });
        }

        return { deleted: true, name: params.name };
    });

    app.delete("/volumes/:name", async (request, reply) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);
        const deleted = await app.controlPlane.store.deleteVolumeByName(params.name);

        if (!deleted) {
            return reply.status(404).send({
                error: "not_found",
                message: `Volume ${params.name} não encontrado.`
            });
        }

        return { deleted: true, name: params.name };
    });

    app.delete("/secrets/:name", async (request, reply) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);
        const deleted = await app.controlPlane.store.deleteSecretByName(params.name);

        if (!deleted) {
            return reply.status(404).send({
                error: "not_found",
                message: `Secret ${params.name} não encontrado.`
            });
        }

        return { deleted: true, name: params.name };
    });

    app.get("/backups", async () => {
        return app.controlPlane.store.listBackupRuns();
    });
}
