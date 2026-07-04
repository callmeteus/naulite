import { z } from "zod";

import { NodeSchema } from "@platform/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List nodes",
        description: "Lists all nodes registered in the cluster.",
        tags: ["nodes"],
        operationId: "listNodes",
        response: {
            200: z.array(NodeSchema)
        }
    },
    async handler() {
        return ControlPlaneService.Store.listNodes();
    }
});
