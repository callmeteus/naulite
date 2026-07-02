import { AgentProxyService } from "../../../services/AgentProxyService";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import {
    ExecInstanceBodySchema,
    IdParamsSchema,
    LooseObjectSchema
} from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Execute instance command",
        description: "Executes a command in an instance through the responsible agent.",
        tags: ["instances"],
        operationId: "execInstanceCommand",
        params: IdParamsSchema,
        body: ExecInstanceBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },
    async handler(req, res) {
        const { id } = req.params;
        const { command } = req.body;

        try {
            return await AgentProxyService.execCommand(
                ControlPlaneService.Store.instance(),
                id,
                command
            );
        } catch (err) {
            return AgentProxyRouteHelpers.respond(res, err);
        }
    }
});
