import type { FastifyInstance } from "fastify";
import { CreateApiKeyBodySchema } from "@naulite/shared";

/**
 * Registers API key management routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerApiKeyRoutes(app: FastifyInstance): Promise<void> {
    app.get("/api-keys", async () => {
        return app.controlPlane.listApiKeys();
    });

    app.post("/api-keys", async (request) => {
        const body = CreateApiKeyBodySchema.parse(request.body);
        return app.controlPlane.createApiKey(body.name);
    });

    app.delete("/api-keys/:id", async (request) => {
        const params = request.params as { id: string };
        await app.controlPlane.revokeApiKey(params.id);
        return { revoked: true };
    });
}
