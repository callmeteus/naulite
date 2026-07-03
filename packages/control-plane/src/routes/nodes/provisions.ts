import { z } from "zod";

import { NodeProvisionSchema } from "@platform/shared";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List node provisions",
        description: "Lists cloud node provision requests and their registration status.",
        tags: ["nodes"],
        operationId: "listNodeProvisions",
        response: {
            200: z.array(NodeProvisionSchema)
        }
    },
    async handler() {
        return ControlPlaneService.NodeProvision.listProvisions();
    }
});
