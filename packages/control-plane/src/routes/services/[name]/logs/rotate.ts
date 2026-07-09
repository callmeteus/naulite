import {
    LooseObjectSchema,
    NameParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../routing/DefineRoute";
import { AgentProxyError, AgentProxyService } from "../../../../services/AgentProxyService";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:write"),
    schema: {
        summary: "Rotate service logs",
        description: "Dispatches log rotation to the agent responsible for the service.",
        tags: ["services"],
        operationId: "rotateServiceLogs",
        params: NameParamsSchema,
        response: {
            200: LooseObjectSchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { name } = req.params;
        const services = await ControlPlaneService.Store.listServices();
        const service = services.find((entry) => entry.name === name);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Service ${name} not found.`
            });
        }

        const instances = await ControlPlaneService.Store.listInstances();
        const instance = instances.find((entry) => entry.serviceName === service.name);
        const nodes = await ControlPlaneService.Store.listNodes();
        const node = nodes.find((entry) => entry.id === instance?.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return res.status(503).send({
                error: "agent_unavailable",
                message: "No agent is available to rotate logs."
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
                message: "Failed to dispatch log rotation."
            });
        }
    }
});
