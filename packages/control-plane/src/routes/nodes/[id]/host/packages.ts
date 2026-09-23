import {
    HostInventoryPageSchema,
    HostPackageListQuerySchema,
    IdParamsSchema,
    RouteErrorResponseSchema,
    type HostInventory
} from "@naulite/shared";

import { ControlPlaneService } from "../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../routing/DefineRoute";
import { AgentProxyRouteHelpers } from "../../../../services/AgentProxyRouteHelpers";
import { HostPackageService } from "../../../../services/HostPackageService";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List node host packages",
        description: "Returns one page of installed host packages. Summary counts cover the full snapshot.",
        tags: ["nodes"],
        operationId: "listNodeHostPackages",
        params: IdParamsSchema,
        querystring: HostPackageListQuerySchema,
        response: {
            200: HostInventoryPageSchema,
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

            let inventory: HostInventory | null = null;

            if (!refresh) {
                inventory = await ControlPlaneService.Store.getHostInventory(id);
            }

            // Collect from the agent when the caller asked for a refresh, or nothing is cached yet
            if (!inventory) {
                inventory = await HostPackageService.refreshInventory(
                    node,
                    (snapshot) => ControlPlaneService.Store.saveHostInventory(snapshot)
                );
            }

            return HostPackageService.pageInventory(inventory, {
                page: req.query.page,
                limit: req.query.limit,
                status: req.query.status
            });
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
