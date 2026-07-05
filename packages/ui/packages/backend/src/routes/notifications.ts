import type { FastifyInstance } from "fastify";
import type { PipelineEventKind } from "@naulite/sdk";

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

    app.get("/notifications/providers/:id/filters", async (request) => {
        const { id } = request.params as { id: string };
        return app.controlPlane.getNotificationProviderFilters(id);
    });

    app.patch("/notifications/providers/:id/filters", async (request) => {
        const { id } = request.params as { id: string };
        const body = request.body as { allowedKinds: PipelineEventKind[] };
        return app.controlPlane.updateNotificationProviderFilters(id, body.allowedKinds);
    });

    app.post("/notifications/test", async () => {
        return app.controlPlane.testNotificationProviders();
    });
}
