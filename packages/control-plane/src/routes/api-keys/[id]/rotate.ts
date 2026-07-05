import { z } from "zod";

import { CreatedApiKeySchema } from "@naulite/shared";

import { ApiKeyRotationConfig } from "../../../auth/ApiKeyRotationConfig";
import { PermissionPreHandlers } from "../../../auth/PermissionPreHandlers";
import { ControlPlaneService } from "../../../ControlPlaneService";
import { HTTP404Error, HTTP503Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";

const RotateApiKeyParamsSchema = z.object({
    id: z.string().min(1)
});

const RotateApiKeyDisabledSchema = z.object({
    message: z.string()
});

/**
 * Rotates an API key when rotation is enabled in platform configuration.
 */
export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:api-keys:write"),
    schema: {
        summary: "Rotate API key",
        description: "Creates a successor API key and keeps the previous key valid during the grace period.",
        tags: ["api-keys"],
        operationId: "rotateApiKey",
        params: RotateApiKeyParamsSchema,
        response: {
            200: CreatedApiKeySchema,
            404: z.object({ message: z.string() }),
            503: RotateApiKeyDisabledSchema
        }
    },
    async handler(req) {
        if (!ApiKeyRotationConfig.isEnabled()) {
            throw new HTTP503Error("API key rotation is disabled.", {
                flag: "NAULITE_API_KEY_ROTATION_ENABLED"
            });
        }

        const rotated = await ControlPlaneService.Store.rotateApiKey(req.params.id);

        if (!rotated) {
            throw new HTTP404Error("API key not found.", {
                id: req.params.id
            });
        }

        return rotated;
    }
});
