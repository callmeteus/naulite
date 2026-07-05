import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { IdParamsSchema, LooseObjectSchema } from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:read"),
    schema: {
        summary: "Get instance logs",
        description: "Fetches instance logs through the responsible agent.",
        tags: ["instances"],
        operationId: "getInstanceLogs",
        params: IdParamsSchema,
        response: {
            200: LooseObjectSchema
        }
    },
    async handler(req, res) {
        const { id } = req.params;

        try {
            return await AgentProxyService.fetchLogs(ControlPlaneService.Store.instance(), id);
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
