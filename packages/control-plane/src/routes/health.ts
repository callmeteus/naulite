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
        const [nodes, services] = await Promise.all([
            app.controlPlane.store.listNodes(),
            app.controlPlane.store.listServices()
        ]);

        const onlineNodes = nodes.filter((node) => node.status === "online").length;
        const status = !databaseHealthy
            ? "unhealthy"
            : onlineNodes === 0
                ? "degraded"
                : "healthy";

        return {
            status,
            controlPlaneId: process.env.CP_INSTANCE_ID ?? "control-plane",
            nodeCount: nodes.length,
            serviceCount: services.length,
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
