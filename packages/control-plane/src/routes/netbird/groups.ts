import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import {
    EnsureNetBirdGroupBodySchema,
    NetBirdGroupResponseSchema,
    NetBirdGroupsListResponseSchema
} from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
