import { ControlPlaneService } from "../../ControlPlaneService";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { defineRoute } from "../../routing/DefineRoute";
import { LooseObjectSchema } from "@platform/shared";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
