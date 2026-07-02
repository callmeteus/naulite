import { z } from "zod";

import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

export const GET = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            id: z.string().min(1)
        }).parse(req.params);

        try {
            return await AgentProxyService.fetchLogs(ControlPlaneService.Store.instance(), routeParams.id);
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
