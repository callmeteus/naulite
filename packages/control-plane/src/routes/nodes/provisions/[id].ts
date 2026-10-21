import { NodeProvisionSchema, IdParamsSchema, RouteMessageResponseSchema } from "@naulite/shared";
import { z } from "zod";

import { ControlPlaneService } from "../../../ControlPlaneService";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";

const AbandonNodeProvisionResponseSchema = z.object({
    deleted: z.literal(true),
    id: z.string().min(1)
});

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
        summary: "Remove node provision",
        description: "Removes a provision from history and terminates the cloud VM when one exists.",
        tags: ["nodes"],
        operationId: "abandonNodeProvision",
        params: IdParamsSchema,
        response: {
            200: AbandonNodeProvisionResponseSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req) {
        return ControlPlaneService.NodeProvision.abandonProvision(req.params.id);
    }
});
