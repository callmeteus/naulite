import { z } from "zod";

import {
    resolvePublicControlPlaneUrl,
    resolvePublicNetBirdManagementUrl
} from "../../bootstrap/BootstrapUrls";
import { AuthPreHandlers } from "../../auth/AuthPreHandlers";
import { HTTP503Error } from "../../errors/TreatedError";
import { defineRoute } from "../../routing/DefineRoute";
import {
    AgentBootstrapResponseSchema,
    RouteMessageResponseSchema
} from "@naulite/shared";

const AgentBootstrapHeadersSchema = z.object({
    "x-naulite-setup-key": z.string().min(1).optional()
});

export const GET = defineRoute({
    preHandler: AuthPreHandlers.checkAgentSetupKey(),
    schema: {
        summary: "Agent bootstrap",
        description: "Returns public control plane and NetBird URLs for agent enrollment.",
        tags: ["bootstrap"],
        operationId: "getAgentBootstrap",
        headers: AgentBootstrapHeadersSchema,
        response: {
            200: AgentBootstrapResponseSchema,
            401: RouteMessageResponseSchema,
            403: RouteMessageResponseSchema,
            503: RouteMessageResponseSchema
        }
    },
    async handler(req) {
        const netbirdManagementUrl = resolvePublicNetBirdManagementUrl();

        if (!netbirdManagementUrl) {
            throw new HTTP503Error("NetBird management URL is not configured.");
        }

        return {
            cpUrl: resolvePublicControlPlaneUrl(req),
            netbirdManagementUrl
        };
    }
});
