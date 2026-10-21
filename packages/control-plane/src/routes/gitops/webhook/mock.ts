import { GitOpsWebhookBodySchema, LooseObjectSchema } from "@naulite/shared";

import { HTTP403Error } from "../../../errors/TreatedError";
import { defineRoute } from "../../../routing/DefineRoute";

import { POST as gitOpsWebhookPost } from "../webhook";

/**
 * Returns whether mock webhooks are enabled for this process.
 *
 * @returns True when mock endpoint is allowed
 */
function isMockWebhookEnabled(): boolean {
    const configured = process.env.NAULITE_WEBHOOK_MOCK?.trim().toLowerCase();

    if (configured === "false" || configured === "0" || configured === "off") {
        return false;
    }

    if (configured === "true" || configured === "1" || configured === "on") {
        return true;
    }

    return process.env.NODE_ENV !== "production";
}

export const POST = defineRoute({
    schema: {
        summary: "GitOps webhook (mock)",
        description: "Accepts a generic unsigned push payload when the mock endpoint is enabled.",
        tags: ["gitops"],
        operationId: "handleGitOpsWebhookMock",
        body: GitOpsWebhookBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },

    async handler(req, reply) {
        if (!isMockWebhookEnabled()) {
            throw new HTTP403Error("Mock webhook is disabled.");
        }

        return gitOpsWebhookPost.handler(req, reply);
    }
});
