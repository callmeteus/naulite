import type { FastifyInstance } from "fastify";
import { BuildServiceBodySchema } from "@platform/shared";

/**
 * Registers build action routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBuildRoutes(app: FastifyInstance): Promise<void> {
    app.post("/build", async (request) => {
        const body = BuildServiceBodySchema.parse(request.body);
        return app.controlPlane.triggerBuild(body);
    });
}
