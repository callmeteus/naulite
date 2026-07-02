import { z } from "zod";

import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

const ExecBodySchema = z.object({
    command: z.array(z.string().min(1)).min(1)
});

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            id: z.string().min(1)
        }).parse(req.params);
        const body = ExecBodySchema.parse(req.body);

        try {
            return await AgentProxyService.execCommand(
                ControlPlaneService.Store.instance(),
                routeParams.id,
                body.command
            );
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
