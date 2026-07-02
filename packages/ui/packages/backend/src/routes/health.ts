import type { FastifyInstance } from "fastify";

/**
 * Registers admin API health routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
    app.get("/health", async () => {
        return {
            status: "ok",
            service: "ui-backend"
        };
    });
}
