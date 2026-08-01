import {
    DeletedByNameResponseSchema,
    NameParamsSchema,
    RouteErrorResponseSchema,
    ServiceSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:read"),
    schema: {
        summary: "Get service",
        description: "Returns a cluster service by name.",
        tags: ["services"],
        operationId: "getServiceByName",
        params: NameParamsSchema,
        response: {
            200: ServiceSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { name } = req.params;
        const service = await ControlPlaneService.Store.getServiceByName(name);

        if (!service) {
            return res.status(404).send({
                error: "not_found",
                message: `Service ${name} not found.`
            });
        }

        return service;
    }
});

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:write"),
    schema: {
        summary: "Delete service",
        description: "Deletes a cluster service by name.",
        tags: ["services"],
        operationId: "deleteServiceByName",
        params: NameParamsSchema,
        response: {
            200: DeletedByNameResponseSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { name } = req.params;
        const deleted = await ControlPlaneService.Store.deleteServiceByName(name);

        if (!deleted) {
            return res.status(404).send({
                error: "not_found",
                message: `Service ${name} not found.`
            });
        }

        return { deleted: true, name };
    }
});
