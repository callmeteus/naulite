import { TargetGroupSchema, UpdateTargetGroupBodySchema } from "@naulite/shared";
import { z } from "zod";

import { LeaderPreHandlers } from "../../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { TargetGroupService } from "../../services/TargetGroupService";

const TargetGroupParamsSchema = z.object({
    id: z.string().min(1)
});

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "Get target group",
        description: "Returns a target group by id.",
        tags: ["target-groups"],
        operationId: "getTargetGroup",
        params: TargetGroupParamsSchema,
        response: {
            200: TargetGroupSchema
        }
    },

    async handler(req) {
        return TargetGroupService.get(req.params.id);
    }
});

export const PATCH = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Update target group",
        description: "Updates target group name or membership.",
        tags: ["target-groups"],
        operationId: "updateTargetGroup",
        params: TargetGroupParamsSchema,
        body: UpdateTargetGroupBodySchema,
        response: {
            200: TargetGroupSchema
        }
    },

    async handler(req) {
        return TargetGroupService.update(req.params.id, req.body);
    }
});

export const DELETE = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Delete target group",
        description: "Deletes a target group.",
        tags: ["target-groups"],
        operationId: "deleteTargetGroup",
        params: TargetGroupParamsSchema,
        response: {
            204: z.null()
        }
    },

    async handler(req, res) {
        await TargetGroupService.remove(req.params.id);
        res.status(204);
        return null;
    }
});
