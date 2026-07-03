import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Registers container registry routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerContainerRegistryRoutes(app: FastifyInstance): Promise<void> {
    app.get("/cr/images", async () => {
        return app.controlPlane.listContainerRegistryImages();
    });

    app.delete("/cr/images/:name/:tag", async (request) => {
        const params = z.object({
            name: z.string().min(1),
            tag: z.string().min(1)
        }).parse(request.params);
        return app.controlPlane.deleteContainerRegistryImage(params.name, params.tag);
    });
}
