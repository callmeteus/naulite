import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { IdParamsSchema, LooseObjectSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
