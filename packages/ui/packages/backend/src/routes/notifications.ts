import type { FastifyInstance } from "fastify";

/**
 * Registers notification management routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
    app.get("/notifications/providers", async () => {
        return app.controlPlane.listNotificationProviders();
    });

    app.post("/notifications/test", async () => {
        return app.controlPlane.testNotificationProviders();
    });
}
