import { z } from "zod";

import { InstanceListQuerySchema, InstanceSchema } from "@platform/shared";
import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List instances",
        description: "Lists service instances with optional service or node filters.",
        tags: ["instances"],
        operationId: "listInstances",
        querystring: InstanceListQuerySchema,
        response: {
            200: z.array(InstanceSchema)
        }
    },
    async handler(req) {
        const { serviceName, nodeId } = req.query;
        return (await ControlPlaneService.Store.listInstances())
            .filter((instance) => {
                if (serviceName && instance.serviceName !== serviceName) {
                    return false;
                }

                if (nodeId && instance.nodeId !== nodeId) {
                    return false;
                }

                return true;
            });
    }
});
