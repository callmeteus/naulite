import { LooseObjectSchema } from "@naulite/shared";
import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("netbird:read"),
    schema: {
        summary: "Get NetBird topology",
        description: "Returns the network topology calculated by NetBird.",
        tags: ["netbird"],
        operationId: "getNetBirdTopology",
        response: {
            200: LooseObjectSchema
        }
    },

    async handler() {
        return await ControlPlaneService.NetBird.getTopology();
    }
});
