import { randomUUID } from "node:crypto";

import { NodeSchema } from "@platform/shared";
import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

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

export const POST = defineRoute({
    async handler(req, res) {
        const body = RegisterNodeBodySchema.parse(req.body);
        const now = new Date().toISOString();
        const existing = body.id
            ? await ControlPlaneService.Store.getNode(body.id)
            : await ControlPlaneService.Store.getNodeByHostname(body.hostname);
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

        await ControlPlaneService.Store.saveNode(node);
        res.code(existing ? 200 : 201);
        return node;
    }
});
