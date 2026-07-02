import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService";
import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

export const POST = defineRoute({
    async handler(req, res) {
        const body = z.object({
            serviceName: z.string().min(1),
            provider: z.string().min(1).optional(),
            registry: z.string().min(1).optional()
        }).parse(req.body);

        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === body.serviceName);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Serviço ${body.serviceName} não encontrado.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const builderNode = nodes.find((node) => node.capabilities.includes("builder")) ?? nodes[0];

        if (!builderNode?.agentUrl) {
            return res.status(503).send({
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
                return res.status(err.statusCode).send({
                    error: err.code,
                    message: err.message
                });
            }

            return res.status(503).send({
                error: "builder_not_configured",
                message: "Build remoto ainda não está implementado no agente."
            });
        }
    }
});
