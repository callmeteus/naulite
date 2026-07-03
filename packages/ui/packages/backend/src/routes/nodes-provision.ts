import type { FastifyInstance } from "fastify";
import { ProvisionNodeBodySchema } from "@platform/shared";

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
}
