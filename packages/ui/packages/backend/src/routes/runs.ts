import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { PipelineRunKindSchema, PipelineRunListQuerySchema, PipelineRunStatusSchema } from "@naulite/shared";

import { createBffError, toBffErrorResponse } from "../errors/BffError";
import { controlPlaneForRequest } from "../util/controlPlaneForRequest";
import { paginateArray } from "../util/paginateArray";

const RunIdParamsSchema = z.object({
    id: z.string().min(1)
});

const RunEventsQuerySchema = z.object({
    since: z.coerce.number().int().nonnegative().optional()
});

const LegacyRunListQuerySchema = z.object({
    kind: PipelineRunKindSchema.optional(),
    status: PipelineRunStatusSchema.optional(),
    service: z.string().min(1).optional(),
    pool: z.string().min(1).optional(),
    since: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50)
});

/**
 * Registers pipeline run routes backed by the control plane API.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerRunsRoutes(app: FastifyInstance): Promise<void> {
    app.get("/runs", async (request) => {
        const rawQuery = request.query as Record<string, unknown>;
        const client = controlPlaneForRequest(app, request);

        if ("page" in rawQuery) {
            const query = PipelineRunListQuerySchema.parse(rawQuery);

            try {
                return await client.listRunsPaginated({
                    kind: query.kind,
                    status: query.status,
                    service: query.service,
                    pool: query.pool,
                    since: query.since,
                    page: query.page,
                    limit: query.limit
                });
            } catch {
                const runs = await client.listRuns({
                    kind: query.kind,
                    status: query.status,
                    service: query.service,
                    pool: query.pool,
                    since: query.since,
                    limit: query.limit
                });

                return paginateArray(runs, query.page, query.limit);
            }
        }

        const query = LegacyRunListQuerySchema.parse(rawQuery);
        return client.listRuns(query);
    });

    app.get("/runs/:id", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);
        return controlPlaneForRequest(app, request).getRun(params.id);
    });

    app.get("/runs/:id/events", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);
        const query = RunEventsQuerySchema.parse(request.query);
        return controlPlaneForRequest(app, request).getRunEvents(params.id, query.since);
    });

    app.get("/runs/:id/stream", async (request, reply) => {
        const params = RunIdParamsSchema.parse(request.params);
        const response = await controlPlaneForRequest(app, request).openRunEventStream(params.id);

        if (!response.ok || !response.body) {
            reply.code(response.status);
            return toBffErrorResponse(createBffError(response.status || 502, "errors.pipelineStreamFailed"));
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

    // Proxy gated-run approval to the control plane
    app.post("/runs/:id/continue", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);

        return controlPlaneForRequest(app, request).continuePipelineRun(params.id);
    });

    // Proxy operator abort to the control plane
    app.post("/runs/:id/abort", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);

        return controlPlaneForRequest(app, request).abortPipelineRun(params.id);
    });

    // Proxy relaunch so the UI does not call the control plane directly
    app.post("/runs/:id/relaunch", async (request) => {
        const params = RunIdParamsSchema.parse(request.params);
        const body = z.object({
            failedOnly: z.boolean().optional()
        }).parse(request.body ?? {});

        return controlPlaneForRequest(app, request).relaunchPipelineRun(params.id, body);
    });
}
