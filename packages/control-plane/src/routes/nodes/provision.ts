import {
    NodeProvisionSchema,
    ProvisionNodeBodySchema
} from "@platform/shared";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Provision node",
        description: "Launches a cloud VM and bootstraps a platform agent via userData.",
        tags: ["nodes"],
        operationId: "provisionNode",
        body: ProvisionNodeBodySchema,
        response: {
            201: NodeProvisionSchema
        }
    },
    async handler(req, res) {
        const provision = await ControlPlaneService.NodeProvision.provision(req.body);
        res.code(201);
        return provision;
    }
});
