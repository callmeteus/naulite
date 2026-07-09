import {
    EnsureNetBirdGroupBodySchema,
    NetBirdGroupResponseSchema,
    NetBirdGroupsListResponseSchema
} from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:read"),
    schema: {
        summary: "List NetBird groups",
        description: "Lists groups managed by self-hosted NetBird.",
        tags: ["netbird"],
        operationId: "listNetBirdGroups",
        response: {
            200: NetBirdGroupsListResponseSchema
        }
    },

    async handler() {
        return {
            groups: await ControlPlaneService.NetBird.listGroups()
        };
    }
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:write"),
    schema: {
        summary: "Ensure NetBird group",
        description: "Creates or returns an internal NetBird group by name.",
        tags: ["netbird"],
        operationId: "ensureNetBirdGroup",
        body: EnsureNetBirdGroupBodySchema,
        response: {
            200: NetBirdGroupResponseSchema
        }
    },

    async handler(req) {
        const { name } = req.body;

        return {
            group: await ControlPlaneService.NetBird.ensureInternalGroup(name)
        };
    }
});
