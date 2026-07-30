import { z } from "zod";

import {
    HostUpdateRunSchema,
    IdParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../../routing/DefineRoute";

const HostUpdateRunsResponseSchema = z.object({
    items: z.array(HostUpdateRunSchema)
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List node host update runs",
        description: "Returns historical host package and system update runs for a node.",
        tags: ["nodes"],
        operationId: "listNodeHostUpdateRuns",
        params: IdParamsSchema,
        response: {
            200: HostUpdateRunsResponseSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const node = await ControlPlaneService.Store.getNode(id);

        if (!node) {
            return res.status(404).send({
                error: "not_found",
                message: "Node not found."
            });
        }

        const items = await ControlPlaneService.Store.listHostUpdateRuns(id);
        return { items };
    }
});
