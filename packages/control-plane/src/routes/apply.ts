import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { ApplyService } from "../services/ApplyService";

const ApplyBodySchema = z.object({
    manifestYaml: z.string().min(1).optional(),
    manifest: z.string().min(1).optional()
}).refine((body) => body.manifestYaml !== undefined || body.manifest !== undefined, {
    message: "manifestYaml or manifest is required."
});

/**
 * Registers manifest apply routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerApplyRoutes(app: FastifyInstance): Promise<void> {
    app.post("/apply", async (request) => {
        const body = ApplyBodySchema.parse(request.body);
        const manifestYaml = body.manifestYaml ?? body.manifest ?? "";
        const result = await ApplyService.execute(app.controlPlane, manifestYaml);

        for (const entry of result.dispatch) {
            app.log.debug(
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
    });
}
