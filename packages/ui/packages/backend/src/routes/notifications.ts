import type { FastifyInstance } from "fastify";
import type {
    CreateNotificationDestinationInput,
    PipelineEventKind,
    UpdateNotificationDestinationInput
} from "@naulite/sdk";

/**
 * Registers notification management routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
    app.get("/notifications/destinations", async () => {
        return app.controlPlane.listNotificationDestinations();
    });

    app.post("/notifications/destinations", async (request) => {
        const body = request.body as CreateNotificationDestinationInput;
        return app.controlPlane.createNotificationDestination(body);
    });

    app.get("/notifications/destinations/:id", async (request) => {
        const { id } = request.params as { id: string };
        return app.controlPlane.getNotificationDestination(id);
    });

    app.patch("/notifications/destinations/:id", async (request) => {
        const { id } = request.params as { id: string };
        const body = request.body as UpdateNotificationDestinationInput;
        return app.controlPlane.updateNotificationDestination(id, body);
    });

    app.delete("/notifications/destinations/:id", async (request) => {
        const { id } = request.params as { id: string };
        return app.controlPlane.deleteNotificationDestination(id);
    });

    app.post("/notifications/destinations/:id/test", async (request) => {
        const { id } = request.params as { id: string };
        return app.controlPlane.testNotificationDestination(id);
    });

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
