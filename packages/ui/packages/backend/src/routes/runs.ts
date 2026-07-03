import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { z } from "zod";

import { PipelineRunListQuerySchema } from "@platform/shared";

const RunIdParamsSchema = z.object({
    id: z.string().min(1)
});

const RunEventsQuerySchema = z.object({
    since: z.coerce.number().int().nonnegative().optional()
});

/**
 * Registers pipeline run routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRunsRoutes(app: FastifyInstance): Promise<void> {
    app.get("/runs", async (request) => {
        const query = PipelineRunListQuerySchema.parse(request.query);
        return app.controlPlane.listRuns(query);
    });

    app.get("/runs/:id", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);
        return app.controlPlane.getRun(params.id);
    });

    app.get("/runs/:id/events", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);
        const query = RunEventsQuerySchema.parse(request.query);
        return app.controlPlane.getRunEvents(params.id, query.since);
    });

    app.get("/runs/:id/stream", async (request, reply) => {
        const params = RunIdParamsSchema.parse(request.params);
        const response = await app.controlPlane.openRunEventStream(params.id);

        if (!response.ok || !response.body) {
            reply.code(response.status);
            return {
                message: "Pipeline run stream failed."
            };
        }

        reply.hijack();
        reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
        });

        const nodeStream = Readable.fromWeb(response.body);
        request.raw.on("close", () => {
            nodeStream.destroy();
        });

        try {
            await pipeline(nodeStream, reply.raw);
        } catch {
            if (!reply.raw.writableEnded) {
                reply.raw.end();
            }
        }

        return;
    });
}
