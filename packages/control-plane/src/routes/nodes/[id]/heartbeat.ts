import { z } from "zod";

import {
    IdParamsSchema,
    NodeOsFamilySchema,
    NodeResourcesSchema,
    NodeSchema,
    NodeStatusSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { AuthPreHandlers } from "../../../auth/AuthPreHandlers";
import { defineRoute } from "../../../routing/DefineRoute";
import { NodeHealthWatcher } from "../../../services/NodeHealthWatcher";

const NodeHeartbeatBodySchema = z.object({
    status: NodeStatusSchema.exclude(["registering"]).default("online"),
    resources: NodeResourcesSchema.optional(),
    osFamily: NodeOsFamilySchema.optional(),
    osVersion: z.string().min(1).optional(),
    arch: z.string().min(1).optional()
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
        const existing = await ControlPlaneService.Store.getNode(id);

        if (!existing) {
            res.code(404);
            return { message: "Node not found." };
        }

        const requestedStatus = body.status ?? "online";

        const updated = await ControlPlaneService.Store.updateNodeHeartbeat(id, {
            status: requestedStatus,
            resources: body.resources,
            osFamily: body.osFamily,
            osVersion: body.osVersion,
            arch: body.arch
        });

        if (!updated) {
            res.code(404);
            return { message: "Node not found." };
        }

        await NodeHealthWatcher.onHeartbeat(updated);

        return updated;
    }
});
