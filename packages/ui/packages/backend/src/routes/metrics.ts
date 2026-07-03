import type { FastifyInstance } from "fastify";
import { z } from "zod";

/**
 * Registers observability routes for the admin panel.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
    const QuerySchema = z.object({
        query: z.string().min(1),
        time: z.string().optional()
    });

    const RangeQuerySchema = z.object({
        query: z.string().min(1),
        start: z.string().min(1),
        end: z.string().min(1),
        step: z.string().default("60s")
    });

    app.get("/metrics", async (_request, reply) => {
        const body = await app.controlPlane.getPrometheusMetrics();
        return reply.type("text/plain; version=0.0.4; charset=utf-8").send(body);
    });

    app.get("/metrics/query", async (request) => {
        const query = QuerySchema.parse(request.query);
        return app.controlPlane.queryMetrics(query.query, query.time);
    });

    app.get("/metrics/query_range", async (request) => {
        const query = RangeQuerySchema.parse(request.query);
        return app.controlPlane.queryMetricsRange(query.query, query.start, query.end, query.step);
    });
}
