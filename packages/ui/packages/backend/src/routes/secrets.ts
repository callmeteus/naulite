import type { FastifyInstance } from "fastify";
import { z } from "zod";

const UpsertSecretBodySchema = z.object({
    name: z.string().min(1),
    data: z.record(z.string(), z.string()).refine((value) => Object.keys(value).length > 0),
    description: z.string().optional()
});

/**
 * Registers secret management routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerSecretRoutes(app: FastifyInstance): Promise<void> {
    app.post("/secrets", async (request) => {
        const body = UpsertSecretBodySchema.parse(request.body);
        return app.controlPlane.upsertSecret(body);
    });

    app.delete("/secrets/:name", async (request) => {
        const params = z.object({
            name: z.string().min(1)
        }).parse(request.params);
        await app.controlPlane.deleteSecret(params.name);
        return { deleted: true, name: params.name };
    });
}
