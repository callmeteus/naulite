import { NodeProvisionSchema, IdParamsSchema } from "@platform/shared";

import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
