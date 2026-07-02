import { z } from "zod";

import { ApplyService } from "../services/ApplyService";
import { defineRoute } from "../routing/DefineRoute";

const ApplyBodySchema = z.object({
    manifestYaml: z.string().min(1).optional(),
    manifest: z.string().min(1).optional()
}).refine((body) => body.manifestYaml !== undefined || body.manifest !== undefined, {
    message: "manifestYaml or manifest is required."
});

export const POST = defineRoute({
    async handler(req) {
        const body = ApplyBodySchema.parse(req.body);
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
