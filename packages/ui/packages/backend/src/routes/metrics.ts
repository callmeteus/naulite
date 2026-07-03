import type { FastifyInstance } from "fastify";

/**
 * Registers observability routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
    app.get("/metrics", async (_request, reply) => {
        const body = await app.controlPlane.getPrometheusMetrics();
        return reply.type("text/plain; version=0.0.4; charset=utf-8").send(body);
    });
}
