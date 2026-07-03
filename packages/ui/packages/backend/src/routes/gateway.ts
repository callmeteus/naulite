import type { FastifyInstance } from "fastify";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";
import { paginateArray, parsePaginationQuery } from "../util/paginateArray";

/**
 * Registers gateway routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerGatewayRoutes(app: FastifyInstance): Promise<void> {
    app.get("/gateway/routes", async (request) => {
        const rawQuery = request.query as Record<string, unknown>;
        const pagination = parsePaginationQuery(rawQuery);
        const client = controlPlaneForRequest(app, request);

        if (!("page" in rawQuery)) {
            return client.listGatewayRoutes();
        }

        try {
            return await client.listGatewayRoutesPaginated(pagination);
        } catch {
            const routes = await client.listGatewayRoutes();
            return paginateArray(routes, pagination.page, pagination.limit);
        }
    });
}
