import { CreateApiKeyBodySchema } from "@platform/shared";

import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { ControlPlaneService } from "../ControlPlaneService";
import { defineRoute } from "../routing/DefineRoute";

const apiKeyAuth = AuthPreHandlers.checkAuthorized({ allowLocalBootstrapRequest: true });

export const GET = defineRoute({
    preHandler: apiKeyAuth,
    async handler() {
        return ControlPlaneService.Store.listApiKeys();
    }
});

export const POST = defineRoute({
    preHandler: apiKeyAuth,
    async handler(req) {
        const body = CreateApiKeyBodySchema.parse(req.body);
        return ControlPlaneService.Store.createApiKey(body.name);
    }
});
