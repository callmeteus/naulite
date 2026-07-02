import { z } from "zod";

import {
    ApiKeySchema,
    CreatedApiKeySchema,
    CreateApiKeyBodySchema
} from "@platform/shared";

import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

export const GET = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
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
