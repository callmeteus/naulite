import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProvisionNodeBodySchema } from "@platform/shared";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";
import { paginateArray, parsePaginationQuery } from "../util/paginateArray";

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
    app.get("/nodes/provisions", async (request) => {
        const pagination = parsePaginationQuery(request.query as Record<string, unknown>);
        const client = controlPlaneForRequest(app, request);

        if (request.query && "page" in (request.query as object)) {
            return client.listNodeProvisions(pagination);
        }

        const provisions = await client.listNodeProvisions({ ...pagination, limit: 200 });
        return paginateArray(provisions.items, pagination.page, pagination.limit);
    });

    app.post("/nodes/provision", async (request) => {
        const body = ProvisionNodeBodySchema.parse(request.body);
        return controlPlaneForRequest(app, request).provisionNode(body);
    });

    app.get("/nodes/provisions/:id", async (request) => {
        const params = ProvisionIdParamsSchema.parse(request.params);
        return controlPlaneForRequest(app, request).getNodeProvision(params.id);
    });

    app.post("/nodes/provisions/:id/terminate", async (request) => {
        const params = ProvisionIdParamsSchema.parse(request.params);
        return controlPlaneForRequest(app, request).terminateNodeProvision(params.id);
    });
}
