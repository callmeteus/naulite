import {
    HostUpdateRequestSchema,
    HostUpdateRunSchema,
    IdParamsSchema,
    RouteErrorResponseSchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../../../routing/DefineRoute";
import { AgentProxyRouteHelpers } from "../../../../../services/AgentProxyRouteHelpers";
import { HostPackageError, HostPackageService } from "../../../../../services/HostPackageService";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:host-update"),
    schema: {
        summary: "Update node host packages",
        description: "Updates selected host packages or all upgradable packages when the list is empty.",
        tags: ["nodes"],
        operationId: "updateNodeHostPackages",
        params: IdParamsSchema,
        body: HostUpdateRequestSchema,
        response: {
            200: HostUpdateRunSchema,
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

            return await HostPackageService.updatePackages(
                node,
                req.body.packages,
                (run) => ControlPlaneService.Store.saveHostUpdateRun(run),
                (inventory) => ControlPlaneService.Store.saveHostInventory(inventory)
            );
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
