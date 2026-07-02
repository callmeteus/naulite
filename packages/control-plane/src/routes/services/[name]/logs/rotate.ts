import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../../../../services/AgentProxyService";
import { ControlPlaneService } from "../../../../ControlPlaneService";
import { defineRoute } from "../../../../routing/DefineRoute";

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            name: z.string().min(1)
        }).parse(req.params);

        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === routeParams.name);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Serviço ${routeParams.name} não encontrado.`
            });
        }

        const instances = await ControlPlaneService.Store.listInstances();
        const instance = instances.find((entry) => entry.serviceName === service.name);
        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes.find((entry) => entry.id === instance?.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
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
                return res.status(err.statusCode).send({
                    error: err.code,
                    message: err.message
                });
            }

            return res.status(500).send({
                error: "internal_error",
                message: "Falha ao despachar rotação de logs."
            });
        }
    }
});
