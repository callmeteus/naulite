import type { FastifyInstance } from "fastify";
import {
    CreateTargetGroupBodySchema,
    TargetGroupListQuerySchema,
    UpdateTargetGroupBodySchema
} from "@naulite/shared";
import { z } from "zod";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";

const TargetGroupIdParamsSchema = z.object({
    id: z.string().min(1)
});

/**
 * Registers target group routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerTargetGroupRoutes(app: FastifyInstance): Promise<void> {
    app.get("/target-groups", async (request) => {
        const query = TargetGroupListQuerySchema.parse(request.query);
        const client = controlPlaneForRequest(app, request);

        return client.listTargetGroups(query);
    });

    app.post("/target-groups", async (request) => {
        const body = CreateTargetGroupBodySchema.parse(request.body);
        const client = controlPlaneForRequest(app, request);

        return client.createTargetGroup(body);
    });

    app.patch("/target-groups/:id", async (request) => {
        const params = TargetGroupIdParamsSchema.parse(request.params);
        const body = UpdateTargetGroupBodySchema.parse(request.body);
        const client = controlPlaneForRequest(app, request);

        return client.updateTargetGroup(params.id, body);
    });

    app.delete("/target-groups/:id", async (request) => {
        const params = TargetGroupIdParamsSchema.parse(request.params);
        const client = controlPlaneForRequest(app, request);

        await client.deleteTargetGroup(params.id);

        return { ok: true };
    });
}
