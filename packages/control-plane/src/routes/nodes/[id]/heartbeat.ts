import { z } from "zod";

import {
    IdParamsSchema,
    NodeResourcesSchema,
    NodeSchema,
    NodeStatusSchema,
    RouteMessageResponseSchema
} from "@platform/shared";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";


const NodeHeartbeatBodySchema = z.object({
    status: NodeStatusSchema.exclude(["registering"]).default("online"),
    resources: NodeResourcesSchema.optional()
});

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Report node heartbeat",
        description: "Updates status and resources reported by an agent.",
        tags: ["nodes"],
        operationId: "updateNodeHeartbeat",
        params: IdParamsSchema,
        body: NodeHeartbeatBodySchema,
        response: {
            200: NodeSchema,
            404: RouteMessageResponseSchema
        }
    },
    async handler(req, res) {
        const { id } = req.params;
        const body = req.body;
        const updated = await ControlPlaneService.Store.updateNodeHeartbeat(id, {
            status: body.status ?? "online",
            resources: body.resources
        });

        if (!updated) {
            res.code(404);
            return { message: "Node not found." };
        }

        return updated;
    }
});
