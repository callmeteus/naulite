import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { NetBirdAclsListResponseSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List NetBird ACLs",
        description: "Lists access rules from self-hosted NetBird.",
        tags: ["netbird"],
        operationId: "listNetBirdAcls",
        response: {
            200: NetBirdAclsListResponseSchema
        }
    },
    async handler() {
        return {
            acls: await ControlPlaneService.NetBird.listAcls()
        };
    }
});
