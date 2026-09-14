import {
    CreateTargetGroupBodySchema,
    PaginatedListSchema,
    RouteErrorResponseSchema,
    TargetGroupListQuerySchema,
    TargetGroupSchema
} from "@naulite/shared";

import { LeaderPreHandlers } from "../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { TargetGroupService } from "../services/TargetGroupService";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("nodes:read"),
    schema: {
        summary: "List target groups",
        description: "Lists deployment target groups with member node ids.",
        tags: ["target-groups"],
        operationId: "listTargetGroups",
        querystring: TargetGroupListQuerySchema,
        response: {
            200: PaginatedListSchema(TargetGroupSchema)
        }
    },

    async handler(req) {
        return TargetGroupService.list(TargetGroupListQuerySchema.parse(req.query));
    }
});

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("nodes:write"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Create target group",
        description: "Creates a target group with explicit node membership.",
        tags: ["target-groups"],
        operationId: "createTargetGroup",
        body: CreateTargetGroupBodySchema,
        response: {
            200: TargetGroupSchema,
            409: RouteErrorResponseSchema
        }
    },

    async handler(req) {
        return TargetGroupService.create(req.body);
    }
});
