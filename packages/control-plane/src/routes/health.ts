import type { FastifyInstance } from "fastify";

/**
 * Registers health check routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
    app.get("/health", async () => {
        const databaseHealthy = await app.controlPlane.databaseProvider.healthCheck();

        return {
            status: databaseHealthy ? "ok" : "degraded",
            database: databaseHealthy ? "up" : "down",
            timestamp: new Date().toISOString()
        };
    });

    app.get("/health/live", async () => ({ status: "ok" }));

    app.get("/health/ready", async () => {
        const databaseHealthy = await app.controlPlane.databaseProvider.healthCheck();
        return {
            ready: databaseHealthy
        };
    });
}
