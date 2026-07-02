import { z } from "zod";

import { SecretSchema } from "@platform/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "List secrets",
        description: "Lists secret metadata stored in the cluster.",
        tags: ["secrets"],
        operationId: "listSecrets",
        response: {
            200: z.array(SecretSchema)
        }
    },
    async handler() {
        return ControlPlaneService.Store.listSecrets();
    }
});
