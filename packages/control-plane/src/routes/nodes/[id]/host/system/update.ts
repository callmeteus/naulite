import {
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
        summary: "Update node host system",
        description: "Performs a full host system update on the node agent.",
        tags: ["nodes"],
        operationId: "updateNodeHostSystem",
        params: IdParamsSchema,
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

            return await HostPackageService.updateSystem(
                node,
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
