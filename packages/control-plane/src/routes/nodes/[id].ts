import {
    IdParamsSchema,
    NodeSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";


export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Get node",
        description: "Returns node details by identifier.",
        tags: ["nodes"],
        operationId: "getNodeById",
        params: IdParamsSchema,
        response: {
            200: NodeSchema,
            404: RouteMessageResponseSchema
        }
    },
    async handler(req, res) {
        const { id } = req.params;
        const node = await ControlPlaneService.Store.getNode(id);

        if (!node) {
            res.code(404);
            return { message: "Node not found." };
        }

        return node;
    }
});
