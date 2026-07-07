import { randomUUID } from "node:crypto";

import { ClusterLabelsSchema, NodeResourcesSchema, NodeSchema } from "@naulite/shared";
import { z } from "zod";

import { ControlPlaneService } from "../../ControlPlaneService";
import { defineRoute } from "../../routing/DefineRoute";

const RegisterNodeBodySchema = z.object({
    id: z.string().min(1).optional(),
    hostname: z.string().min(1),
    agentVersion: z.string().min(1),
    agentUrl: z.string().url().optional(),
    labels: ClusterLabelsSchema.default({}),
    capabilities: z.array(z.string()).default([]),
    resources: NodeResourcesSchema,
    netbirdDeviceId: z.string().min(1).optional(),
    provisionId: z.string().min(1).optional()
});

export const POST = defineRoute({
    schema: {
        summary: "Register node",
        description: "Registers or updates an agent in the cluster during bootstrap.",
        tags: ["nodes"],
        operationId: "registerNode",
        body: RegisterNodeBodySchema,
        response: {
            200: NodeSchema,
            201: NodeSchema
        }
    },
    async handler(req, res) {
        const body = req.body;
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

        if (body.agentUrl) {
            void ControlPlaneService.InstanceReconciler.reconcileNode(node.id);
        }

        if (body.provisionId) {
            await ControlPlaneService.NodeProvision.completeRegistration(body.provisionId, node.id);
        }

        res.code(existing ? 200 : 201);
        return node;
    }
});
