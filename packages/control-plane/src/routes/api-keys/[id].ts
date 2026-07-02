import { z } from "zod";

import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

const RevokeApiKeyParamsSchema = z.object({
    id: z.string().min(1)
});

const RevokeApiKeyResponseSchema = z.object({
    revoked: z.literal(true)
});

const RevokeApiKeyNotFoundSchema = z.object({
    message: z.string()
});

export const DELETE = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Revoke API key",
        description: "Revokes an API key by identifier.",
        tags: ["api-keys"],
        operationId: "revokeApiKey",
        params: RevokeApiKeyParamsSchema,
        response: {
            200: RevokeApiKeyResponseSchema,
            404: RevokeApiKeyNotFoundSchema
        }
    },
    async handler(req, res) {
        const { id } = req.params;
        const revoked = await ControlPlaneService.Store.revokeApiKey(id);

        if (!revoked) {
            res.code(404);
            return { message: "API key not found." };
        }

        return { revoked: true };
    }
});
