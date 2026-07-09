import {
    ResolvedSecretSchema,
    RouteErrorResponseSchema,
    SecretNameQuerySchema
} from "@naulite/shared";

import { ControlPlaneService } from "../../ControlPlaneService";
import { PermissionPreHandlers } from "../../auth/PermissionPreHandlers";
import { HTTP404Error } from "../../errors/TreatedError";
import { defineRoute } from "../../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("secrets:read"),
    schema: {
        summary: "Reveal secret values",
        description: "Returns decrypted secret values for operator review.",
        tags: ["secrets"],
        operationId: "revealSecretByName",
        querystring: SecretNameQuerySchema,
        response: {
            200: ResolvedSecretSchema,
            404: RouteErrorResponseSchema
        }
    },

    async handler(req) {
        const { name } = req.query;
        const data = await ControlPlaneService.Secrets.revealValues(name);

        if (!data) {
            throw new HTTP404Error(`Secret ${name} not found.`, {
                error: "not_found"
            });
        }

        return { name, data };
    }
});
