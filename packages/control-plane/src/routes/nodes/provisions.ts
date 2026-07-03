import { NodeProvisionSchema, PaginatedListSchema, PaginationQuerySchema } from "@platform/shared";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
