import {
    ExecInstanceBodySchema,
    IdParamsSchema,
    LooseObjectSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { AgentProxyRouteHelpers } from "../../../services/AgentProxyRouteHelpers";
import { AgentProxyService } from "../../../services/AgentProxyService";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:write"),
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
        const { command, stdin, tty } = req.body;

        if (stdin === true || tty === true) {
            return res.status(400).send({
                error: "Use GET /instances/:id/exec/ws for interactive exec."
            });
        }

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
