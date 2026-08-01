import {
    IdParamsSchema,
    InstanceSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";
import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

const InstanceLifecycleResultSchema = z.object({
    instanceId: z.string(),
    status: z.enum(["dispatched", "failed"]),
    message: z.string().optional()
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("workloads:read"),
    schema: {
        summary: "Get instance",
        description: "Returns instance details by identifier.",
        tags: ["instances"],
        operationId: "getInstanceById",
        params: IdParamsSchema,
        response: {
            200: InstanceSchema,
            404: RouteMessageResponseSchema
        }
    },

    async handler(req, res) {
        const { id } = req.params;
        const instance = await ControlPlaneService.Store.getInstance(id);

        if (!instance) {
            res.code(404);
            return { message: "Instance not found." };
        }

        return instance;
    }
});

export const DELETE = defineRoute({
    preHandler: [
        AuthPreHandlers.authorizedLocalOrApiKey,
        LeaderPreHandlers.requireLeader(),
        PermissionPreHandlers.requirePermission("workloads:write")
    ],

    schema: {
        summary: "Remove instance",
        description: "Stops and removes a workload instance from its node agent and deletes the control plane record.",
        tags: ["instances"],
        operationId: "removeInstance",
        params: IdParamsSchema,
        response: {
            200: InstanceLifecycleResultSchema
        }
    },

    async handler(req) {
        return ControlPlaneService.InstanceLifecycle.removeInstance(req.params.id);
    }
});
