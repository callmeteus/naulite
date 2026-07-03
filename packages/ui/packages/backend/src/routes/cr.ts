import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";
import { paginateArray, parsePaginationQuery } from "../util/paginateArray";

/**
 * Registers container registry routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerContainerRegistryRoutes(app: FastifyInstance): Promise<void> {
    app.get("/cr/images", async (request) => {
        const rawQuery = request.query as Record<string, unknown>;
        const pagination = parsePaginationQuery(rawQuery);
        const client = controlPlaneForRequest(app, request);

        if (!("page" in rawQuery)) {
            return client.listContainerRegistryImages();
        }

        try {
            return await client.listContainerRegistryImagesPaginated(pagination);
        } catch {
            const images = await client.listContainerRegistryImages();
            return paginateArray(images, pagination.page, pagination.limit);
        }
    });

    app.delete("/cr/images/:name/:tag", async (request) => {
        const params = z.object({
            name: z.string().min(1),
            tag: z.string().min(1)
        }).parse(request.params);
        return controlPlaneForRequest(app, request).deleteContainerRegistryImage(params.name, params.tag);
    });
}
