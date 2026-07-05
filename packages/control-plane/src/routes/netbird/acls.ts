import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { NetBirdAclsListResponseSchema } from "@naulite/shared";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:read"),
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
