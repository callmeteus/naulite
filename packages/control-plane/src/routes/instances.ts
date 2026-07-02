import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService.js";

const InstanceStatusBodySchema = z.object({
    status: z.enum(["pending", "running", "stopped", "failed"]),
    containerId: z.string().min(1).optional(),
    health: z.object({
        healthy: z.boolean(),
        checkedAt: z.string().min(1),
        message: z.string().optional()
    }).optional()
});

const ExecBodySchema = z.object({
    command: z.array(z.string().min(1)).min(1)
});

/**
 * Registers instance lifecycle and proxy routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerInstanceRoutes(app: FastifyInstance): Promise<void> {
    app.post("/instances/:id/status", async (request, reply) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);
        const body = InstanceStatusBodySchema.parse(request.body);
        const updated = await app.controlPlane.store.updateInstance(params.id, {
            status: body.status,
            containerId: body.containerId,
            health: body.health
        });

        if (!updated) {
            return reply.status(404).send({
                error: "not_found",
                message: `Instância ${params.id} não encontrada.`
            });
        }

        return updated;
    });

    app.get("/instances/:id/logs", async (request, reply) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);

        try {
            return await AgentProxyService.fetchLogs(app.controlPlane.store, params.id);
        } catch (err) {
            return handleProxyError(reply, err);
        }
    });

    app.post("/instances/:id/exec", async (request, reply) => {
        const params = z.object({
            id: z.string().min(1)
        }).parse(request.params);
        const body = ExecBodySchema.parse(request.body);

        try {
            return await AgentProxyService.execCommand(
                app.controlPlane.store,
                params.id,
                body.command
            );
        } catch (err) {
            return handleProxyError(reply, err);
        }
    });
}

/**
 * Maps agent proxy errors to HTTP responses.
 *
 * @param reply Fastify reply
 * @param err Caught error
 * @returns Fastify reply with error payload
 */
function handleProxyError(
    reply: { status: (code: number) => { send: (payload: unknown) => unknown } },
    err: unknown
) {
    if (err instanceof AgentProxyError) {
        return reply.status(err.statusCode).send({
            error: err.code,
            message: err.message
        });
    }

    return reply.status(500).send({
        error: "internal_error",
        message: "Falha ao encaminhar requisição ao agente."
    });
}
