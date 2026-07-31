import { ApplyManifestBodySchema, LooseObjectSchema } from "@naulite/shared";
import { z } from "zod";
import { LeaderPreHandlers } from "../auth/LeaderPreHandlers";
import { PermissionPreHandlers } from "../auth/PermissionPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { ApplyService } from "../services/ApplyService";

const ApplyQuerySchema = z.object({
    async: z.enum(["true", "false"]).optional()
});

export const POST = defineRoute({
    preHandler: [
        ...PermissionPreHandlers.authorizedWithPermission("manifests:apply"),
        LeaderPreHandlers.requireLeader()
    ],

    schema: {
        summary: "Apply manifest",
        description: "Applies a YAML manifest to the cluster and dispatches the plan to agents.",
        tags: ["apply"],
        operationId: "applyManifest",
        querystring: ApplyQuerySchema,
        body: ApplyManifestBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },

    async handler(req) {
        const body = req.body;
        const manifestYaml = body.manifestYaml ?? body.manifest ?? "";
        const buildContextRoot = body.buildContextRoot;

        if (req.query.async === "true") {
            return await ApplyService.enqueue(manifestYaml, {
                buildContextRoot
            });
        }

        const result = await ApplyService.execute(manifestYaml, {
            buildContextRoot,
            repositoryUrl: "inline://apply"
        });

        for (const entry of result.dispatch) {
            req.log.debug(
                {
                    nodeId: entry.nodeId,
                    planId: entry.planId,
                    status: entry.status,
                    agentUrl: entry.agentUrl
                },
                "agent dispatch result"
            );
        }

        return result;
    }
});
