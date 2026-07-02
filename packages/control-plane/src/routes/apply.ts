import { ApplyService } from "../services/ApplyService";
import { AuthPreHandlers } from "../auth/AuthPreHandlers";
import { defineRoute } from "../routing/DefineRoute";
import { ApplyManifestBodySchema, LooseObjectSchema } from "@platform/shared";

export const POST = defineRoute({
    preHandler: AuthPreHandlers.authorizedLocalOrApiKey,
    schema: {
        summary: "Apply manifest",
        description: "Applies a YAML manifest to the cluster and dispatches the plan to agents.",
        tags: ["apply"],
        operationId: "applyManifest",
        body: ApplyManifestBodySchema,
        response: {
            200: LooseObjectSchema
        }
    },
    async handler(req) {
        const body = req.body;
        const manifestYaml = body.manifestYaml ?? body.manifest ?? "";
        const result = await ApplyService.execute(manifestYaml);

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
