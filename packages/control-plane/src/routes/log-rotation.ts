import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService";

/**
 * Registers service log rotation routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerLogRotationRoutes(app: FastifyInstance): Promise<void> {
    app.post("/services/:name/logs/rotate", async (request, reply) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);

        const services = await app.controlPlane.store.listServices();
        const service = services.find((entry) => entry.name === params.name);

        if (!service) {
            return reply.status(404).send({
                error: "not_found",
                message: `Serviço ${params.name} não encontrado.`
            });
        }

        const instances = await app.controlPlane.store.listInstances();
        const instance = instances.find((entry) => entry.serviceName === service.name);
        const nodes = await app.controlPlane.store.listNodes();
        const node = nodes.find((entry) => entry.id === instance?.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return reply.status(503).send({
                error: "agent_unavailable",
                message: "Nenhum agente disponível para rotacionar logs."
            });
        }

        try {
            return await AgentProxyService.postTask(node.agentUrl, "/tasks/log-rotation", {
                serviceName: service.name,
                policy: service.logRotation
            });
        } catch (err) {
            if (err instanceof AgentProxyError) {
                return reply.status(err.statusCode).send({
                    error: err.code,
                    message: err.message
                });
            }

            return reply.status(500).send({
                error: "internal_error",
                message: "Falha ao despachar rotação de logs."
            });
        }
    });
}
