import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService";
import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import {
    BuildServiceBodySchema,
    LooseObjectSchema,
    RouteErrorResponseSchema
} from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Trigger service build",
        description: "Requests a service image build on a node with the builder capability.",
        tags: ["build"],
        operationId: "triggerServiceBuild",
        body: BuildServiceBodySchema,
        response: {
            200: LooseObjectSchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },
    async handler(req, res) {
        const { serviceName, provider, registry } = req.body;
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === serviceName);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Service ${serviceName} not found.`
            });
        }

        const nodes = await ControlPlaneService.Store.listNodes();
        const builderNode = nodes.find((node) => node.capabilities.includes("builder")) ?? nodes[0];

        if (!builderNode?.agentUrl) {
            return res.status(503).send({
                error: "builder_not_configured",
                message: "No builder is configured in the cluster."
            });
        }

        try {
            const response = await AgentProxyService.postTask(builderNode.agentUrl, "/tasks/build", {
                serviceName,
                provider,
                registry
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
                message: "Remote build is not implemented on the agent yet."
            });
        }
    }
});
