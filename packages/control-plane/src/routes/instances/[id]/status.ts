import {
    IdParamsSchema,
    InstanceSchema,
    RouteErrorResponseSchema,
    UpdateInstanceStatusBodySchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { ServiceStatusService } from "../../../services/ServiceStatusService";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Update instance status",
        description: "Updates status, container, and health check data reported by the agent.",
        tags: ["instances"],
        operationId: "updateInstanceStatus",
        params: IdParamsSchema,
        body: UpdateInstanceStatusBodySchema,
        response: {
            200: InstanceSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const body = req.body;
        const updated = await ControlPlaneService.Store.updateInstance(id, {
            status: body.status,
            containerId: body.containerId,
            health: body.health
        });

        if (!updated) {
            return res.status(404).send({
                error: "not_found",
                message: `Instance ${id} not found.`
            });
        }

        await ServiceStatusService.syncFromInstances(updated.serviceId);

        return updated;
    }
});
