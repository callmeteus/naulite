import { GitOpsWebhookBodySchema, LooseObjectSchema } from "@naulite/shared";
import { z } from "zod";

import { HTTP403Error } from "../../../errors/TreatedError";
import { GiteaWebhookMapper } from "../../../gitops/GiteaWebhookMapper";
import { defineRoute } from "../../../routing/DefineRoute";

import { POST as gitOpsWebhookPost } from "../webhook";

const GiteaWebhookQuerySchema = z.object({
    manifestPath: z.string().min(1).default("luckymaker-ci.lab.naulite.yml"),
    target: z.string().min(1).optional(),
    nauliteCpHealthUrl: z.string().url().optional()
});

/**
 * Returns whether the Gitea webhook adapter is enabled in this process.
 *
 * @returns True when the route accepts unsigned Gitea hooks in dev/lab
 */
function isGiteaWebhookEnabled(): boolean {
    const configured = process.env.NAULITE_WEBHOOK_GITEA?.trim().toLowerCase();

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
        summary: "GitOps webhook (Gitea)",
        description: "Accepts Gitea push hooks and triggers the GitOps pipeline (lab/dev).",
        tags: ["gitops"],
        operationId: "handleGitOpsGiteaWebhook",
        querystring: GiteaWebhookQuerySchema,
        body: z.record(z.unknown()),
        response: {
            200: LooseObjectSchema
        }
    },

    async handler(req, reply) {
        if (!isGiteaWebhookEnabled()) {
            throw new HTTP403Error("Gitea webhook adapter is disabled.");
        }

        const query = GiteaWebhookQuerySchema.parse(req.query);
        const deliveryHeader = req.headers["x-gitea-delivery"];
        const deliveryId = typeof deliveryHeader === "string" ? deliveryHeader : undefined;
        const mapped = GiteaWebhookMapper.map(req.body, {
            manifestPath: query.manifestPath,
            deliveryId
        });

        const vars: Record<string, string> = {};

        if (query.target) {
            vars.TARGET = query.target;
        }

        if (query.nauliteCpHealthUrl) {
            vars.NAULITE_CP_HEALTH_URL = query.nauliteCpHealthUrl;
        }

        req.body = GitOpsWebhookBodySchema.parse({
            ...mapped,
            vars: Object.keys(vars).length > 0 ? vars : undefined
        });

        return gitOpsWebhookPost.handler(req, reply);
    }
});
