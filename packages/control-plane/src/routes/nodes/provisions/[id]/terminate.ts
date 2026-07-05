import { NodeProvisionSchema, IdParamsSchema } from "@naulite/shared";

import { PermissionPreHandlers } from "../../../../auth/PermissionPreHandlers";
import { ControlPlaneService } from "../../../../ControlPlaneService";
import { defineRoute } from "../../../../routing/DefineRoute";

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:terminate"),
    schema: {
        summary: "Terminate node provision",
        description: "Terminates the cloud VM associated with a provision request.",
        tags: ["nodes"],
        operationId: "terminateNodeProvisionPost",
        params: IdParamsSchema,
        response: {
            200: NodeProvisionSchema
        }
    },
    async handler(req) {
        return ControlPlaneService.NodeProvision.terminateProvision(req.params.id);
    }
});
