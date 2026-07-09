import { NodeProvisionSchema, IdParamsSchema } from "@naulite/shared";

import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Get node provision",
        description: "Returns a single cloud node provision request.",
        tags: ["nodes"],
        operationId: "getNodeProvision",
        params: IdParamsSchema,
        response: {
            200: NodeProvisionSchema
        }
    },

    async handler(req) {
        return ControlPlaneService.NodeProvision.getProvision(req.params.id);
    }
});

export const DELETE = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:terminate"),
    schema: {
        summary: "Terminate node provision",
        description: "Terminates the cloud VM associated with a provision request.",
        tags: ["nodes"],
        operationId: "terminateNodeProvision",
        params: IdParamsSchema,
        response: {
            200: NodeProvisionSchema
        }
    },

    async handler(req) {
        return ControlPlaneService.NodeProvision.terminateProvision(req.params.id);
    }
});
