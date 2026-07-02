import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService";

/**
 * Registers image build routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBuildRoutes(app: FastifyInstance): Promise<void> {
    app.post("/build", async (request, reply) => {
        const body = z.object({
            serviceName: z.string().min(1),
            provider: z.string().min(1).optional(),
            registry: z.string().min(1).optional()
        }).parse(request.body);

        const services = await app.controlPlane.store.listServices();
        const service = services.find((entry) => entry.name === body.serviceName);

        if (!service) {
            return reply.status(404).send({
                error: "not_found",
                message: `Serviço ${body.serviceName} não encontrado.`
            });
        }

        const nodes = await app.controlPlane.store.listNodes();
        const builderNode = nodes.find((node) => node.capabilities.includes("builder")) ?? nodes[0];

        if (!builderNode?.agentUrl) {
            return reply.status(503).send({
                error: "builder_not_configured",
                message: "Nenhum builder está configurado no cluster."
            });
        }

        try {
            const response = await AgentProxyService.postTask(builderNode.agentUrl, "/tasks/build", {
                serviceName: body.serviceName,
                provider: body.provider,
                registry: body.registry
            });

            return response;
        } catch (err) {
            if (err instanceof AgentProxyError) {
                return reply.status(err.statusCode).send({
                    error: err.code,
                    message: err.message
                });
            }

            return reply.status(503).send({
                error: "builder_not_configured",
                message: "Build remoto ainda não está implementado no agente."
            });
        }
    });
}
