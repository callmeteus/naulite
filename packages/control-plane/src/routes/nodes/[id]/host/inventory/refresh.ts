import {
    HostInventorySchema,
    IdParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../../routing/DefineRoute";
import { AgentProxyRouteHelpers } from "../../../../../services/AgentProxyRouteHelpers";
import { HostPackageService } from "../../../../../services/HostPackageService";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Refresh node host inventory",
        description: "Collects a fresh host package inventory snapshot from the node agent.",
        tags: ["nodes"],
        operationId: "refreshNodeHostInventory",
        params: IdParamsSchema,
        response: {
            200: HostInventorySchema,
            404: RouteErrorResponseSchema,
            503: RouteErrorResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;

        try {
            const node = await HostPackageService.requireAgentNode(
                (nodeId) => ControlPlaneService.Store.getNode(nodeId),
                id
            );

            return await HostPackageService.refreshInventory(
                node,
                (inventory) => ControlPlaneService.Store.saveHostInventory(inventory)
            );
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
