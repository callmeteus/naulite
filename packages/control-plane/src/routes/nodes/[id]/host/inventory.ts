import { z } from "zod";

import {
    HostInventorySchema,
    IdParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../routing/DefineRoute";
import { AgentProxyRouteHelpers } from "../../../../services/AgentProxyRouteHelpers";
import { HostPackageError, HostPackageService } from "../../../../services/HostPackageService";

const HostInventoryQuerySchema = z.object({
    refresh: z.enum(["true", "false"]).optional()
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Get node host inventory",
        description: "Returns the cached host package inventory for a node. Use refresh=true to collect a new snapshot.",
        tags: ["nodes"],
        operationId: "getNodeHostInventory",
        params: IdParamsSchema,
        querystring: HostInventoryQuerySchema,
        response: {
            200: HostInventorySchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const refresh = req.query.refresh === "true";

        try {
            const node = await HostPackageService.requireAgentNode(
                (nodeId) => ControlPlaneService.Store.getNode(nodeId),
                id
            );

            if (refresh) {
                return await HostPackageService.refreshInventory(
                    node,
                    (inventory) => ControlPlaneService.Store.saveHostInventory(inventory)
                );
            }

            const inventory = await ControlPlaneService.Store.getHostInventory(id);

            if (!inventory) {
                return await HostPackageService.refreshInventory(
                    node,
                    (snapshot) => ControlPlaneService.Store.saveHostInventory(snapshot)
                );
            }

            return inventory;
        } catch (err) {
            if (err instanceof HostPackageError) {
                return res.status(err.status).send({
                    error: err.code,
                    message: err.message
                });
            }

            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
