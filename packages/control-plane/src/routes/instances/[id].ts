import {
    IdParamsSchema,
    InstanceSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:read"),
    schema: {
        summary: "Get instance",
        description: "Returns instance details by identifier.",
        tags: ["instances"],
        operationId: "getInstanceById",
        params: IdParamsSchema,
        response: {
            200: InstanceSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const instance = await ControlPlaneService.Store.getInstance(id);

        if (!instance) {
            res.code(404);
            return { message: "Instance not found." };
        }

        return instance;
    }
});
