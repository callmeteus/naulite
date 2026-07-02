import { z } from "zod";

import { ControlPlaneService } from "../../../ControlPlaneService";
import { defineRoute } from "../../../routing/DefineRoute";

const InstanceStatusBodySchema = z.object({
    status: z.enum(["pending", "running", "stopped", "failed"]),
    containerId: z.string().min(1).optional(),
    health: z.object({
        healthy: z.boolean(),
        checkedAt: z.string().min(1),
        message: z.string().optional()
    }).optional()
});

export const POST = defineRoute({
    async handler(req, res) {
        const routeParams = z.object({
            id: z.string().min(1)
        }).parse(req.params);
        const body = InstanceStatusBodySchema.parse(req.body);
        const updated = await ControlPlaneService.Store.updateInstance(routeParams.id, {
            status: body.status,
            containerId: body.containerId,
            health: body.health
        });

        if (!updated) {
            return res.status(404).send({
                error: "not_found",
                message: `Instância ${routeParams.id} não encontrada.`
            });
        }

        return updated;
    }
});
