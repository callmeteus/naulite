import {
    IdParamsSchema,
    NodeSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

const DeleteNodeResponseSchema = z.object({
    deleted: z.literal(true),
    id: z.string().min(1)
});

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

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:write"),
    schema: {
        summary: "Deregister node",
        description: "Removes a node from the control plane and deletes related instance and host records.",
        tags: ["nodes"],
        operationId: "deregisterNode",
        params: IdParamsSchema,
        response: {
            200: DeleteNodeResponseSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const deleted = await ControlPlaneService.Store.deleteNode(id);

        if (!deleted) {
            res.code(404);
            return { message: "Node not found." };
        }

        return { deleted: true, id };
    }
});
