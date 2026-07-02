import type { FastifyInstance } from "fastify";
import { z } from "zod";

const ApplyBodySchema = z.object({
    manifest: z.string().min(1)
});

/**
 * Registers cluster dashboard routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerClusterRoutes(app: FastifyInstance): Promise<void> {
    app.get("/nodes", async () => {
        return app.controlPlane.listNodes();
    });

    app.get("/services", async () => {
        return app.controlPlane.listServices();
    });

    app.get("/backups", async () => {
        return app.controlPlane.listBackups();
    });

    app.post("/apply", async (request) => {
        const body = ApplyBodySchema.parse(request.body);
        return app.controlPlane.applyManifest(body.manifest);
    });
}
