import { z } from "zod";

import {
    ApiKeySchema,
    CreatedApiKeySchema,
    CreateApiKeyBodySchema
} from "@naulite/shared";

import { ControlPlaneService } from "../ControlPlaneService";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:api-keys:read"),
    schema: {
        summary: "List API keys",
        description: "Lists active control plane API keys.",
        tags: ["api-keys"],
        operationId: "listApiKeys",
        response: {
            200: z.array(ApiKeySchema)
        }
    },

    async handler() {
        return ControlPlaneService.Store.listApiKeys();
    }
});

export const POST = defineRoute({
    preHandler: PermissionPreHandlers.authorizedWithPermission("admin:api-keys:write"),
    schema: {
        summary: "Create API key",
        description: "Creates a new API key and returns the plaintext secret once.",
        tags: ["api-keys"],
        operationId: "createApiKey",
        body: CreateApiKeyBodySchema,
        response: {
            200: CreatedApiKeySchema
        }
    },

    async handler(req) {
        const { name } = req.body;
        return ControlPlaneService.Store.createApiKey(name);
    }
});
