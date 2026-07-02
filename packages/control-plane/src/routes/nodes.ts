import { randomUUID } from "node:crypto";

import { NodeSchema } from "@platform/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

const RegisterNodeBodySchema = z.object({
    hostname: z.string().min(1),
    agentVersion: z.string().min(1),
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
        const node = NodeSchema.parse({
            id: randomUUID(),
            hostname: body.hostname,
            status: "registering",
            labels: body.labels,
            capabilities: body.capabilities,
            resources: body.resources,
            agentVersion: body.agentVersion,
            netbirdDeviceId: body.netbirdDeviceId,
            lastHeartbeatAt: now,
            createdAt: now,
            updatedAt: now
        });

        await app.controlPlane.store.saveNode(node);
        reply.code(201);
        return { node };
    });

    app.get("/nodes", async () => {
        return {
            nodes: await app.controlPlane.store.listNodes()
        };
    });

    app.get("/nodes/:id", async (request, reply) => {
        const params = z.object({ id: z.string().min(1) }).parse(request.params);
        const node = await app.controlPlane.store.getNode(params.id);

        if (!node) {
            reply.code(404);
            return { message: "Node not found." };
        }

        return { node };
    });
}
