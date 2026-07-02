import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { AgentProxyError, AgentProxyService } from "../services/AgentProxyService";

/**
 * Registers backup trigger routes.
 *
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerBackupRoutes(app: FastifyInstance): Promise<void> {
    app.post("/backups/:volumeName/run", async (request, reply) => {
        const params = z.object({
            volumeName: z.string().min(1)
        }).parse(request.params);

        const volumes = await app.controlPlane.store.listVolumes();
        const volume = volumes.find((entry) => entry.name === params.volumeName);

        if (!volume) {
            return reply.status(404).send({
                error: "not_found",
                message: `Volume ${params.volumeName} não encontrado.`
            });
        }

        const nodes = await app.controlPlane.store.listNodes();
        const node = nodes.find((entry) => entry.id === volume.nodeId) ?? nodes[0];

        if (!node?.agentUrl) {
            return reply.status(503).send({
                error: "agent_unavailable",
                message: "Nenhum agente disponível para executar backup."
            });
        }

        const run = await app.controlPlane.store.enqueueBackupRun(params.volumeName);

        try {
            await AgentProxyService.postTask(node.agentUrl, "/tasks/backup", {
                taskId: run.id,
                volumeName: params.volumeName
            });
        } catch (err) {
            return handleProxyError(reply, err);
        }

        return run;
    });

    app.post("/backups/:backupId/restore", async (request, reply) => {
        const params = z.object({
            backupId: z.string().min(1)
        }).parse(request.params);

        const runs = await app.controlPlane.store.listBackupRuns();
        const run = runs.find((entry) => entry.id === params.backupId);

        if (!run) {
            return reply.status(404).send({
                error: "not_found",
                message: `Backup ${params.backupId} não encontrado.`
            });
        }

        const nodes = await app.controlPlane.store.listNodes();
        const node = nodes[0];

        if (!node?.agentUrl) {
            return reply.status(503).send({
                error: "agent_unavailable",
                message: "Nenhum agente disponível para restaurar backup."
            });
        }

        try {
            return await AgentProxyService.postTask(node.agentUrl, "/backups/receive", {
                backupId: params.backupId,
                volumeName: run.volumeName
            });
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
