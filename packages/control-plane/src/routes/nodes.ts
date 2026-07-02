import { randomUUID } from "node:crypto";

import { NodeSchema } from "@platform/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const RegisterNodeBodySchema = z.object({
    id: z.string().min(1).optional(),
    hostname: z.string().min(1),
    agentVersion: z.string().min(1),
    agentUrl: z.string().url().optional(),
    labels: z.record(z.string(), z.string()).default({}),
    capabilities: z.array(z.string()).default([]),
    resources: z.object({
        cpuMillisTotal: z.number().int().nonnegative(),
        cpuMillisUsed: z.number().int().nonnegative(),
        memoryMbTotal: z.number().int().nonnegative(),
        memoryMbUsed: z.number().int().nonnegative(),
        diskMbTotal: z.number().int().nonnegative(),
        diskMbUsed: z.number().int().nonnegative()
    }),
    netbirdDeviceId: z.string().min(1).optional()
});

const HeartbeatBodySchema = z.object({
    status: z.enum(["online", "offline", "draining", "unhealthy"]).default("online"),
    resources: z.object({
        cpuMillisTotal: z.number().int().nonnegative(),
        cpuMillisUsed: z.number().int().nonnegative(),
        memoryMbTotal: z.number().int().nonnegative(),
        memoryMbUsed: z.number().int().nonnegative(),
        diskMbTotal: z.number().int().nonnegative(),
        diskMbUsed: z.number().int().nonnegative()
    }).optional()
});

/**
 * Registers node management routes.
 * 
 * @param app Fastify application instance
 * @returns Nothing.
 */
export async function registerNodeRoutes(app: FastifyInstance): Promise<void> {
    app.post("/nodes/register", async (request, reply) => {
        const body = RegisterNodeBodySchema.parse(request.body);
        const now = new Date().toISOString();
        const existing = body.id
            ? await app.controlPlane.store.getNode(body.id)
            : await app.controlPlane.store.getNodeByHostname(body.hostname);
        const node = NodeSchema.parse({
            id: body.id ?? existing?.id ?? randomUUID(),
            hostname: body.hostname,
            status: existing ? "online" : "registering",
            labels: body.labels,
            capabilities: body.capabilities,
            resources: body.resources,
            agentVersion: body.agentVersion,
            agentUrl: body.agentUrl,
            netbirdDeviceId: body.netbirdDeviceId,
            lastHeartbeatAt: now,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now
        });

        await app.controlPlane.store.saveNode(node);
        reply.code(existing ? 200 : 201);
        return node;
    });

    app.post("/nodes/:id/heartbeat", async (request, reply) => {
        const params = z.object({ id: z.string().min(1) }).parse(request.params);
        const body = HeartbeatBodySchema.parse(request.body);
        const updated = await app.controlPlane.store.updateNodeHeartbeat(params.id, {
            status: body.status,
            resources: body.resources
        });

        if (!updated) {
            reply.code(404);
            return { message: "Node not found." };
        }

        return updated;
    });

    app.get("/nodes", async () => {
        return app.controlPlane.store.listNodes();
    });

    app.get("/nodes/:id", async (request, reply) => {
        const params = z.object({ id: z.string().min(1) }).parse(request.params);
        const node = await app.controlPlane.store.getNode(params.id);

        if (!node) {
            reply.code(404);
            return { message: "Node not found." };
        }

        return node;
    });
}
