import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProvisionNodeBodySchema } from "@platform/shared";

const ProvisionIdParamsSchema = z.object({
    id: z.string().min(1)
});

/**
 * Registers node provisioning routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNodeProvisionRoutes(app: FastifyInstance): Promise<void> {
    app.post("/nodes/provision", async (request) => {
        const body = ProvisionNodeBodySchema.parse(request.body);
        return app.controlPlane.provisionNode(body);
    });

    app.get("/nodes/provisions/:id", async (request) => {
        const params = ProvisionIdParamsSchema.parse(request.params);
        return app.controlPlane.getNodeProvision(params.id);
    });
}
