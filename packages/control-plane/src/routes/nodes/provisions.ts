import { NodeProvisionSchema, PaginatedListSchema, PaginationQuerySchema } from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List node provisions",
        description: "Lists cloud node provision requests and their registration status.",
        tags: ["nodes"],
        operationId: "listNodeProvisions",
        querystring: PaginationQuerySchema,
        response: {
            200: PaginatedListSchema(NodeProvisionSchema)
        }
    },

    async handler(req) {
        return ControlPlaneService.NodeProvision.listProvisions(req.query);
    }
});
