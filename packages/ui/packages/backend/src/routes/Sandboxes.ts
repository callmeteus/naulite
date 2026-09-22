import type { FastifyInstance } from "fastify";
import {
    SandboxTemplateListQuerySchema,
    UpdateSandboxTemplateBodySchema,
    CreateSandboxTemplateBodySchema
} from "@naulite/shared";
import { z } from "zod";

import { controlPlaneForRequest } from "../util/controlPlaneForRequest";

const SandboxIdParamsSchema = z.object({
    id: z.string().min(1)
});

/**
 * Registers sandbox template routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerSandboxRoutes(app: FastifyInstance): Promise<void> {
    app.get("/sandboxes", async (request) => {
        const query = SandboxTemplateListQuerySchema.parse(request.query);
        const client = controlPlaneForRequest(app, request);

        return client.listSandboxTemplates(query);
    });

    app.post("/sandboxes", async (request) => {
        const body = CreateSandboxTemplateBodySchema.parse(request.body);
        const client = controlPlaneForRequest(app, request);

        return client.createSandboxTemplate(body);
    });

    app.get("/sandboxes/:id", async (request) => {
        const params = SandboxIdParamsSchema.parse(request.params);
        const client = controlPlaneForRequest(app, request);

        return client.getSandboxTemplate(params.id);
    });

    app.patch("/sandboxes/:id", async (request) => {
        const params = SandboxIdParamsSchema.parse(request.params);
        const body = UpdateSandboxTemplateBodySchema.parse(request.body);
        const client = controlPlaneForRequest(app, request);

        return client.updateSandboxTemplate(params.id, body);
    });

    app.post("/sandboxes/:id/bake", async (request) => {
        const params = SandboxIdParamsSchema.parse(request.params);
        const client = controlPlaneForRequest(app, request);

        return client.triggerSandboxBake(params.id);
    });
}
